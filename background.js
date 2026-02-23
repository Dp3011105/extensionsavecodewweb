// Import JSZip
importScripts('libs/jszip.min.js');

let captureData = [];
let captureStartTime;
let activeTabId = null;
let captureOptions = {};
let fileContents = {};
let isCapturing = false;
let captureSessionId = null;
let captureSessionListener = null;
let accumulatedData = {
  requests: [],
  files: {},
  harEntries: []
};

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startCapture':
      batDauThuThap(request.tabId, request.options)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'stopCapture':
      stopCapture(request.sessionId)
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getCaptureStatus':
      sendResponse({
        isCapturing,
        activeTabId,
        requestCount: captureData.length,
        fileCount: Object.keys(fileContents).length,
        sessionId: captureSessionId,
        accumulatedRequests: accumulatedData.requests.length,
        accumulatedFiles: Object.keys(accumulatedData.files).length
      });
      break;
      
    case 'getAccumulatedData':
      sendResponse({
        requests: captureData,
        files: fileContents,
        harEntries: accumulatedData.harEntries
      });
      break;
  }
});

async function batDauThuThap(tabId, options) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🚀 Bắt đầu thu thập từ tab:', tabId);
      
      if (isCapturing) {
        throw new Error('Đang có phiên thu thập khác đang chạy');
      }
      
      // Reset data nhưng giữ lại accumulated data cho phiên mới
      captureData = [];
      fileContents = {};
      accumulatedData = {
        requests: [],
        files: {},
        harEntries: []
      };
      
      captureStartTime = Date.now();
      activeTabId = tabId;
      captureOptions = options;
      isCapturing = true;
      captureSessionId = generateSessionId();
      
      if (!tabId) throw new Error('Không tìm thấy tab');
      
      // Attach debugger
      try {
        await chrome.debugger.attach({ tabId: tabId }, "1.3");
        console.log('✅ Đã đính kèm debugger');
      } catch (e) {
        isCapturing = false;
        if (e.message.includes('Another debugger')) {
          throw new Error('Đang có DevTools mở. Vui lòng đóng DevTools và thử lại');
        }
        throw e;
      }
      
      // Enable network events
      await chrome.debugger.sendCommand({ tabId: tabId }, "Network.enable");
      await chrome.debugger.sendCommand({ tabId: tabId }, "Network.setCacheDisabled", { cacheDisabled: true });
      
      // Listen to events
      const listener = (source, method, params) => {
        if (source.tabId === tabId && isCapturing) {
          xuLyNetworkEvent(method, params);
        }
      };
      
      chrome.debugger.onEvent.addListener(listener);
      
      // Store listener for cleanup
      captureSessionListener = listener;
      
      console.log('✅ Đã bắt đầu thu thập, đợi lệnh dừng...');
      resolve({ 
        success: true, 
        sessionId: captureSessionId,
        message: 'Đã bắt đầu thu thập dữ liệu' 
      });
      
    } catch (error) {
      console.error('❌ Lỗi:', error);
      isCapturing = false;
      
      if (activeTabId) {
        try { await chrome.debugger.detach({ tabId: activeTabId }); } catch (e) {}
      }
      
      reject(error);
    }
  });
}

async function stopCapture(sessionId) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!isCapturing || sessionId !== captureSessionId) {
        throw new Error('Không tìm thấy phiên thu thập đang chạy');
      }
      
      console.log('🛑 Đang dừng thu thập...');
      
      // Remove listener
      if (captureSessionListener) {
        chrome.debugger.onEvent.removeListener(captureSessionListener);
      }
      
      // Detach debugger
      if (activeTabId) {
        try {
          await chrome.debugger.detach({ tabId: activeTabId });
        } catch (e) {
          console.log('Lỗi khi detach debugger:', e);
        }
      }
      
      // Cập nhật accumulated data
      accumulatedData.requests = [...accumulatedData.requests, ...captureData];
      accumulatedData.files = { ...accumulatedData.files, ...fileContents };
      
      // Tải nội dung thật của các file (chỉ tải những file chưa có)
      console.log('📥 Đang tải nội dung thật của các file mới...');
      await taiNoiDungFileMoi();
      
      // Cập nhật lại accumulated files sau khi tải
      accumulatedData.files = { ...accumulatedData.files, ...fileContents };
      
      // Lấy thông tin tab
      const tab = await chrome.tabs.get(activeTabId);
      
      // Tạo file ZIP với tất cả dữ liệu đã tích lũy
      const fileName = taoTenFile();
      const zipBlob = await taoFileZIPTongHop(tab);
      
      // Tải file
      await taiFileZIP(zipBlob, fileName);
      
      // Thống kê tổng hợp
      const stats = {
        requestCount: accumulatedData.requests.length,
        fileCount: Object.keys(accumulatedData.files).length,
        captureTime: Date.now() - captureStartTime,
        fileSize: formatFileSize(zipBlob.size),
        sessionRequests: captureData.length,
        sessionFiles: Object.keys(fileContents).length
      };
      
      // Reset state
      isCapturing = false;
      activeTabId = null;
      captureSessionId = null;
      
      console.log('✅ Thu thập thành công!', stats);
      console.log(`📊 Tổng hợp: ${stats.requestCount} requests, ${stats.fileCount} files`);
      
      resolve({ success: true, stats });
      
    } catch (error) {
      console.error('❌ Lỗi khi dừng:', error);
      isCapturing = false;
      reject(error);
    }
  });
}

function xuLyNetworkEvent(method, params) {
  switch (method) {
    case 'Network.requestWillBeSent':
      const request = {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        headers: params.request.headers,
        postData: params.request.postData,
        type: params.type,
        timestamp: params.timestamp,
        wallTime: params.wallTime || Date.now() / 1000,
        initiator: params.initiator,
        documentURL: params.documentURL
      };
      
      const existingIndex = captureData.findIndex(r => r.requestId === params.requestId);
      if (existingIndex >= 0) {
        captureData[existingIndex] = { ...captureData[existingIndex], ...request };
      } else {
        captureData.push(request);
        
        // Thêm vào HAR entries
        accumulatedData.harEntries.push({
          requestId: params.requestId,
          url: params.request.url,
          method: params.request.method,
          timestamp: params.timestamp,
          wallTime: params.wallTime || Date.now() / 1000,
          type: params.type
        });
      }
      break;
      
    case 'Network.responseReceived':
      const index = captureData.findIndex(r => r.requestId === params.requestId);
      if (index >= 0) {
        captureData[index].response = {
          status: params.response.status,
          statusText: params.response.statusText,
          headers: params.response.headers,
          mimeType: params.response.mimeType,
          encodedDataLength: params.response.encodedDataLength,
          url: params.response.url
        };
      }
      break;
  }
}

// 🎯 TẢI NỘI DUNG THẬT CỦA FILE MỚI
async function taiNoiDungFileMoi() {
  const downloadPromises = [];
  const downloadedUrls = new Set();
  
  // Lấy danh sách URL đã tải từ accumulated files
  Object.values(accumulatedData.files).forEach(file => {
    if (file.url) downloadedUrls.add(file.url);
  });
  
  for (const req of captureData) {
    if (req.response && req.response.status === 200 && req.url) {
      if (req.url.startsWith('data:')) continue;
      if (!req.url.startsWith('http')) continue;
      
      // Bỏ qua nếu đã tải rồi
      if (downloadedUrls.has(req.url)) continue;
      
      const mimeType = req.response.mimeType || '';
      const url = req.url;
      
      const shouldDownload = 
        mimeType.includes('text/html') ||
        mimeType.includes('text/css') ||
        mimeType.includes('javascript') ||
        mimeType.includes('application/json') ||
        mimeType.includes('image/') ||
        url.match(/\.(css|js|html|htm|json|xml|svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf)$/i);
      
      if (shouldDownload) {
        console.log('⏳ Đang tải mới:', url);
        
        const promise = fetch(url)
          .then(async response => {
            if (!response.ok) return;
            
            const contentType = response.headers.get('content-type') || '';
            const fileName = taoTenFileTuURL(url);
            
            // Tránh trùng tên file
            let uniqueFileName = fileName;
            let counter = 1;
            while (fileContents[uniqueFileName] || accumulatedData.files[uniqueFileName]) {
              const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.')) : '';
              const name = fileName.includes('.') ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
              uniqueFileName = `${name}_${counter}${ext}`;
              counter++;
            }
            
            if (contentType.includes('image/')) {
              const blob = await response.blob();
              fileContents[uniqueFileName] = {
                type: 'blob',
                data: blob,
                url: url,
                mimeType: contentType,
                originalUrl: url
              };
              console.log('✅ Đã tải ảnh mới:', uniqueFileName);
            } else {
              const text = await response.text();
              fileContents[uniqueFileName] = {
                type: 'text',
                data: text,
                url: url,
                mimeType: contentType,
                originalUrl: url
              };
              console.log('✅ Đã tải file mới:', uniqueFileName);
            }
          })
          .catch(err => {
            console.log('❌ Lỗi tải:', url, err.message);
          });
        
        downloadPromises.push(promise);
      }
    }
  }
  
  await Promise.allSettled(downloadPromises);
  console.log(`📦 Đã tải thêm ${Object.keys(fileContents).length} files mới`);
}

function taoTenFileTuURL(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    
    if (path === '' || path.endsWith('/')) {
      path += 'index.html';
    }
    
    // Thêm hostname vào path để tránh trùng tên
    const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    path = path.replace(/^\//, '');
    path = `${hostname}/${path}`;
    path = path.replace(/[^a-zA-Z0-9\/._-]/g, '_');
    
    return path;
  } catch {
    return `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

// 🎯 TẠO FILE ZIP TỔNG HỢP TẤT CẢ DỮ LIỆU
async function taoFileZIPTongHop(tab) {
  const zip = new JSZip();
  
  // Kết hợp tất cả dữ liệu
  const allRequests = [...accumulatedData.requests, ...captureData];
  const allFiles = { ...accumulatedData.files, ...fileContents };
  
  console.log(`📦 Tổng hợp: ${allRequests.length} requests, ${Object.keys(allFiles).length} files`);
  
  // 1. Thư mục gốc - index.html preview
  zip.file("index.html", taoTrangChinh(tab, allRequests, allFiles));
  
  // 2. Thư mục chứa mã nguồn (phân loại theo domain)
  const sourceFolder = zip.folder("source_code");
  
  // Tạo subfolders theo domain
  const filesByDomain = {};
  for (const [fileName, fileInfo] of Object.entries(allFiles)) {
    if (fileInfo.type === 'text') {
      try {
        const url = new URL(fileInfo.url || fileInfo.originalUrl);
        const domain = url.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        if (!filesByDomain[domain]) filesByDomain[domain] = [];
        filesByDomain[domain].push({ fileName, fileInfo });
      } catch {
        if (!filesByDomain['unknown']) filesByDomain['unknown'] = [];
        filesByDomain['unknown'].push({ fileName, fileInfo });
      }
    }
  }
  
  // Thêm files theo domain
  for (const [domain, files] of Object.entries(filesByDomain)) {
    const domainFolder = sourceFolder.folder(domain);
    for (const { fileName, fileInfo } of files) {
      // Lấy tên file không bao gồm domain
      const shortName = fileName.includes('/') ? fileName.substring(fileName.indexOf('/') + 1) : fileName;
      domainFolder.file(shortName, fileInfo.data);
    }
  }
  
  // 3. Thư mục chứa ảnh
  const imagesFolder = zip.folder("images");
  for (const [fileName, fileInfo] of Object.entries(allFiles)) {
    if (fileInfo.type === 'blob' && fileInfo.mimeType.includes('image/')) {
      const shortName = fileName.includes('/') ? fileName.substring(fileName.indexOf('/') + 1) : fileName;
      imagesFolder.file(shortName, fileInfo.data, { binary: true });
    }
  }
  
  // 4. Thư mục chứa dữ liệu HAR
  const harFolder = zip.folder("har_data");
  const harData = taoHARTongHop(tab, allRequests);
  harFolder.file("network_trace.har", JSON.stringify(harData, null, 2));
  
  // 5. Thư mục chứa summary theo từng phiên
  const sessionsFolder = harFolder.folder("sessions");
  
  // Session hiện tại
  sessionsFolder.file("current_session.json", JSON.stringify({
    sessionId: captureSessionId,
    startTime: new Date(captureStartTime).toISOString(),
    endTime: new Date().toISOString(),
    requests: captureData.map(r => ({
      url: r.url,
      method: r.method,
      status: r.response?.status,
      type: r.type
    })),
    files: Object.keys(fileContents)
  }, null, 2));
  
  // Session cũ (nếu có)
  if (accumulatedData.requests.length > 0) {
    sessionsFolder.file("accumulated_sessions.json", JSON.stringify({
      totalRequests: accumulatedData.requests.length,
      totalFiles: Object.keys(accumulatedData.files).length,
      requests: accumulatedData.requests.map(r => ({
        url: r.url,
        method: r.method,
        status: r.response?.status,
        type: r.type
      }))
    }, null, 2));
  }
  
  // 6. File thông tin tổng hợp
  zip.file("metadata.json", JSON.stringify({
    exportedAt: new Date().toISOString(),
    url: tab.url,
    title: tab.title,
    totalRequests: allRequests.length,
    totalFilesDownloaded: Object.keys(allFiles).length,
    captureDuration: Date.now() - captureStartTime,
    sessions: {
      current: {
        requests: captureData.length,
        files: Object.keys(fileContents).length
      },
      accumulated: {
        requests: accumulatedData.requests.length,
        files: Object.keys(accumulatedData.files).length
      }
    },
    exportTool: "Lưu HAR Extension - Accumulated Capture",
    options: captureOptions
  }, null, 2));
  
  // Tạo blob
  const zipBlob = await zip.generateAsync({ 
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
  
  return zipBlob;
}

function taoTrangChinh(tab, allRequests, allFiles) {
  const fileCount = Object.keys(allFiles).length;
  const stats = {
    totalRequests: allRequests.length,
    totalFiles: fileCount,
    html: Object.keys(allFiles).filter(f => f.endsWith('.html')).length,
    css: Object.keys(allFiles).filter(f => f.endsWith('.css')).length,
    js: Object.keys(allFiles).filter(f => f.endsWith('.js')).length,
    images: Object.keys(allFiles).filter(f => f.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)).length,
    accumulatedRequests: accumulatedData.requests.length,
    accumulatedFiles: Object.keys(accumulatedData.files).length,
    currentRequests: captureData.length,
    currentFiles: Object.keys(fileContents).length
  };
  
  // Tạo danh sách files theo domain
  const filesByDomain = {};
  for (const fileName of Object.keys(allFiles)) {
    const domain = fileName.includes('/') ? fileName.split('/')[0] : 'root';
    if (!filesByDomain[domain]) filesByDomain[domain] = [];
    filesByDomain[domain].push(fileName);
  }
  
  const domainList = Object.entries(filesByDomain)
    .map(([domain, files]) => `
      <div style="margin-bottom: 20px;">
        <div style="color: #e94560; font-weight: bold; margin-bottom: 10px;">📁 ${domain}</div>
        ${files.map(file => {
          const icon = file.match(/\.(png|jpg|jpeg|gif)$/i) ? '🖼️' : 
                      file.endsWith('.html') ? '📄' :
                      file.endsWith('.css') ? '🎨' :
                      file.endsWith('.js') ? '⚡' : '📁';
          const shortName = file.includes('/') ? file.substring(file.indexOf('/') + 1) : file;
          return `<div class="file-item">${icon} ${shortName}</div>`;
        }).join('')}
      </div>
    `).join('');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Website Snapshot - ${tab.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #1a1a2e; color: #e0e0e0; }
    .container { max-width: 1200px; margin: 0 auto; background: #16213e; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
    h1 { color: #e94560; border-bottom: 2px solid #e94560; padding-bottom: 10px; }
    h2 { color: #e94560; margin-top: 30px; }
    .info { background: #0f3460; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .stat-card { background: linear-gradient(135deg, #e94560, #0f3460); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: bold; }
    .session-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
    .session-card { background: #1a1a2e; padding: 20px; border-radius: 8px; border-left: 4px solid #e94560; }
    .folder-structure { background: #1a1a2e; padding: 20px; border-radius: 8px; font-family: monospace; }
    .file-list { margin-top: 20px; max-height: 400px; overflow-y: auto; background: #1a1a2e; padding: 20px; border-radius: 8px; }
    .file-item { padding: 5px 0; border-bottom: 1px solid #333; }
    .domain-group { margin-bottom: 20px; }
    a { color: #e94560; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📦 Website Snapshot: ${tab.title}</h1>
    
    <div class="info">
      <p><strong>URL gốc:</strong> <a href="${tab.url}" target="_blank">${tab.url}</a></p>
      <p><strong>Thời gian thu thập:</strong> ${new Date().toLocaleString('vi-VN')}</p>
      <p><strong>Mô tả:</strong> File ZIP tổng hợp từ nhiều phiên thu thập</p>
    </div>
    
    <h2>📊 Thống kê tổng hợp</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.totalFiles}</div>
        <div>Tổng files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.html}</div>
        <div>HTML files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.css}</div>
        <div>CSS files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.js}</div>
        <div>JS files</div>
      </div>
    </div>
    
    <h2>📈 Chi tiết phiên</h2>
    <div class="session-stats">
      <div class="session-card">
        <h3 style="color: #e94560; margin-bottom: 10px;">Phiên hiện tại</h3>
        <p>Requests: <strong>${stats.currentRequests}</strong></p>
        <p>Files: <strong>${stats.currentFiles}</strong></p>
      </div>
      <div class="session-card">
        <h3 style="color: #e94560; margin-bottom: 10px;">Dữ liệu tích lũy</h3>
        <p>Requests: <strong>${stats.accumulatedRequests}</strong></p>
        <p>Files: <strong>${stats.accumulatedFiles}</strong></p>
      </div>
    </div>
    
    <h2>📁 Cấu trúc thư mục</h2>
    <div class="folder-structure">
      <div>📦 ${taoTenFile()}.zip</div>
      <div>  ├── 📄 index.html (trang này)</div>
      <div>  ├── 📁 source_code/ (mã nguồn theo domain)</div>
      <div>  ├── 📁 images/ (ảnh tải về)</div>
      <div>  └── 📁 har_data/</div>
      <div>      ├── 📄 network_trace.har</div>
      <div>      └── 📁 sessions/ (dữ liệu theo phiên)</div>
    </div>
    
    <h2>📋 Danh sách files theo domain</h2>
    <div class="file-list">
      ${domainList}
    </div>
    
    <p style="margin-top: 30px; color: #666; font-style: italic;">
            Được tạo bởi SAVE CODE - Đức Phước 

    </p>
  </div>
</body>
</html>`;
}

function taoHARTongHop(tab, allRequests) {
  const entries = allRequests.map(req => {
    const requestHeaders = [];
    const responseHeaders = [];
    
    if (req.headers) {
      Object.entries(req.headers).forEach(([name, value]) => {
        requestHeaders.push({ name, value: String(value) });
      });
    }
    if (req.response?.headers) {
      Object.entries(req.response.headers).forEach(([name, value]) => {
        responseHeaders.push({ name, value: String(value) });
      });
    }
    
    return {
      pageref: "page_1",
      startedDateTime: new Date((req.wallTime || Date.now() / 1000) * 1000).toISOString(),
      request: {
        method: req.method || "GET",
        url: req.url || "",
        headers: requestHeaders
      },
      response: {
        status: req.response?.status || 0,
        statusText: req.response?.statusText || "",
        headers: responseHeaders,
        content: {
          size: req.encodedDataLength || 0,
          mimeType: req.response?.mimeType || "application/octet-stream"
        }
      }
    };
  });
  
  return {
    log: {
      version: "1.2",
      creator: { name: "Lưu HAR Extension", version: "4.0" },
      browser: { name: "Chrome", version: navigator.userAgent },
      pages: [{
        startedDateTime: new Date(captureStartTime).toISOString(),
        id: "page_1",
        title: tab.title || "Current Page"
      }],
      entries: entries,
      comment: `Tổng hợp từ ${allRequests.length} requests`
    }
  };
}

async function taiFileZIP(blob, filename) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      
      reader.onload = function() {
        const dataUrl = reader.result;
        
        chrome.downloads.download({
          url: dataUrl,
          filename: filename + '.zip',
          conflictAction: 'uniquify',
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Không thể tải file: ' + chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      };
      
      reader.onerror = function() {
        reject(new Error('Không thể đọc file'));
      };
      
      reader.readAsDataURL(blob);
      
    } catch (error) {
      reject(error);
    }
  });
}

function taoTenFile() {
  const now = new Date();
  return `Website_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
