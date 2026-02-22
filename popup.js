document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const currentUrlEl = document.getElementById('currentUrl');
  const selectTabBtn = document.getElementById('selectTabBtn');
  const startCaptureBtn = document.getElementById('startCaptureBtn');
  const stopCaptureBtn = document.getElementById('stopCaptureBtn');
  const stopButtonContainer = document.getElementById('stopButtonContainer');
  const statusMessage = document.getElementById('statusMessage');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const statsPanel = document.getElementById('statsPanel');
  const statRequests = document.getElementById('statRequests');
  const statResources = document.getElementById('statResources');
  const statTime = document.getElementById('statTime');
  const statSize = document.getElementById('statSize');
  
  // Live status elements
  const captureStatus = document.getElementById('captureStatus');
  const liveRequests = document.getElementById('liveRequests');
  const liveFiles = document.getElementById('liveFiles');
  const captureTimer = document.getElementById('captureTimer');
  
  // Step indicators
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  
  // State
  let selectedTab = null;
  let isCapturing = false;
  let currentSessionId = null;
  let timerInterval = null;
  let captureStartTime = null;
  let statusCheckInterval = null;
  
  // Khởi tạo
  kiemTraTrangThaiCapture();
  hienThiThongTinTab();
  
  // Kiểm tra trạng thái capture mỗi giây
  setInterval(kiemTraTrangThaiCapture, 1000);
  
  async function kiemTraTrangThaiCapture() {
    try {
      const response = await guiTinNhanh({ action: 'getCaptureStatus' });
      if (response && response.isCapturing) {
        isCapturing = true;
        currentSessionId = response.sessionId;
        selectedTab = { id: response.activeTabId };
        
        // Cập nhật UI
        capNhatUITheoTrangThai();
        liveRequests.textContent = response.requestCount || 0;
        liveFiles.textContent = response.fileCount || 0;
        
        // Bắt đầu timer nếu chưa có
        if (!timerInterval) {
          captureStartTime = Date.now();
          batDauTimer();
        }
      } else {
        if (isCapturing) {
          // Vừa kết thúc capture
          isCapturing = false;
          currentSessionId = null;
          captureStatus.classList.remove('active');
          stopButtonContainer.style.display = 'none';
          startCaptureBtn.disabled = false;
          dungTimer();
        }
      }
    } catch (error) {
      console.log('Lỗi kiểm tra trạng thái:', error);
    }
  }
  
  // Hiển thị thông tin tab
  async function hienThiThongTinTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        let displayUrl = tab.url || 'Không có URL';
        if (displayUrl.length > 60) {
          displayUrl = displayUrl.substring(0, 60) + '...';
        }
        currentUrlEl.textContent = displayUrl;
        currentUrlEl.title = tab.url || '';
        
        // Tự động chọn tab hiện tại
        selectedTab = tab;
        startCaptureBtn.disabled = false;
        step1.classList.add('active');
      }
    } catch (error) {
      currentUrlEl.textContent = 'Lỗi: ' + error.message;
    }
  }
  
  // Chọn tab
  selectTabBtn.addEventListener('click', async function() {
    try {
      hienThiThongBao('Đang mở trình chọn tab...', 'info');
      
      // Mở tab picker
      const tabs = await chrome.tabs.query({});
      // Tạo một popup nhỏ để chọn tab (có thể nâng cấp sau)
      
      // Tạm thời lấy tab đang active
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      selectedTab = tab;
      
      let displayUrl = tab.url || 'Không có URL';
      if (displayUrl.length > 60) {
        displayUrl = displayUrl.substring(0, 60) + '...';
      }
      currentUrlEl.textContent = displayUrl;
      currentUrlEl.title = tab.url || '';
      
      startCaptureBtn.disabled = false;
      step1.classList.add('active');
      
      hienThiThongBao(`✅ Đã chọn: ${tab.title}`, 'success');
    } catch (error) {
      hienThiThongBao('❌ Lỗi: ' + error.message, 'error');
    }
  });
  
  // Bắt đầu capture
  startCaptureBtn.addEventListener('click', async function() {
    try {
      if (!selectedTab) {
        hienThiThongBao('Vui lòng chọn tab trước', 'error');
        return;
      }
      
      if (!selectedTab.url || selectedTab.url.startsWith('chrome://') || selectedTab.url.startsWith('edge://')) {
        hienThiThongBao('Không thể thu thập từ trang hệ thống', 'error');
        return;
      }
      
      // Options mặc định
      const options = {
        filterType: 'includeAll',
        includeHeaders: true,
        includeTimings: true,
        includePostData: true
      };
      
      // Disable nút
      startCaptureBtn.disabled = true;
      hienThiThongBao('Đang bắt đầu thu thập...', 'info');
      hienThiTienTrinh(30, 'Đang kết nối...');
      
      // Gửi yêu cầu bắt đầu thu thập
      const response = await guiTinNhanh({
        action: 'startCapture',
        tabId: selectedTab.id,
        options: options
      });
      
      if (response.success) {
        isCapturing = true;
        currentSessionId = response.sessionId;
        captureStartTime = Date.now();
        
        // Cập nhật UI
        anTienTrinh();
        capNhatUITheoTrangThai();
        hienThiThongBao('✅ Đang thu thập dữ liệu. Hãy trải nghiệm trang web!', 'success');
        
        // Bắt đầu timer
        batDauTimer();
        
        // Bắt đầu kiểm tra số liệu
        batDauKiemTraSoLieu();
      } else {
        hienThiThongBao('❌ Lỗi: ' + response.error, 'error');
        anTienTrinh();
        startCaptureBtn.disabled = false;
      }
      
    } catch (error) {
      hienThiThongBao('❌ Lỗi: ' + error.message, 'error');
      anTienTrinh();
      startCaptureBtn.disabled = false;
    }
  });
  
  // Dừng capture và xuất file
  stopCaptureBtn.addEventListener('click', async function() {
    try {
      if (!isCapturing || !currentSessionId) {
        hienThiThongBao('Không có phiên thu thập nào đang chạy', 'error');
        return;
      }
      
      // Disable nút
      stopCaptureBtn.disabled = true;
      hienThiThongBao('Đang xử lý và xuất file...', 'info');
      hienThiTienTrinh(50, 'Đang tải nội dung...');
      
      // Gửi yêu cầu dừng
      const response = await guiTinNhanh({
        action: 'stopCapture',
        sessionId: currentSessionId
      });
      
      if (response.success) {
        hienThiTienTrinh(100, 'Đang tạo ZIP...');
        
        setTimeout(() => {
          anTienTrinh();
          hienThiThongBao('✅ Xuất file thành công!', 'success');
          hienThiThongKe(response.stats);
          
          // Cập nhật UI
          isCapturing = false;
          currentSessionId = null;
          captureStatus.classList.remove('active');
          stopButtonContainer.style.display = 'none';
          startCaptureBtn.disabled = false;
          dungTimer();
          
          // Reset steps
          step2.classList.remove('active');
          step3.classList.add('active');
        }, 1000);
      } else {
        hienThiThongBao('❌ Lỗi: ' + response.error, 'error');
        anTienTrinh();
        stopCaptureBtn.disabled = false;
      }
      
    } catch (error) {
      hienThiThongBao('❌ Lỗi: ' + error.message, 'error');
      anTienTrinh();
      stopCaptureBtn.disabled = false;
    }
  });
  
  function capNhatUITheoTrangThai() {
    if (isCapturing) {
      captureStatus.classList.add('active');
      stopButtonContainer.style.display = 'block';
      startCaptureBtn.disabled = true;
      step2.classList.add('active');
      step3.classList.remove('active');
    } else {
      captureStatus.classList.remove('active');
      stopButtonContainer.style.display = 'none';
      step2.classList.remove('active');
    }
  }
  
  function batDauTimer() {
    dungTimer();
    timerInterval = setInterval(() => {
      if (captureStartTime) {
        const elapsed = Math.floor((Date.now() - captureStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        captureTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }
  
  function dungTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    captureTimer.textContent = '00:00';
  }
  
  function batDauKiemTraSoLieu() {
    if (statusCheckInterval) {
      clearInterval(statusCheckInterval);
    }
    
    statusCheckInterval = setInterval(async () => {
      if (isCapturing) {
        try {
          const response = await guiTinNhanh({ action: 'getCaptureStatus' });
          if (response && response.isCapturing) {
            liveRequests.textContent = response.requestCount || 0;
            liveFiles.textContent = response.fileCount || 0;
          }
        } catch (error) {
          console.log('Lỗi cập nhật số liệu:', error);
        }
      }
    }, 2000);
  }
  
  function hienThiThongBao(message, type) {
    statusMessage.className = 'status-message ' + type;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    statusMessage.innerHTML = `${icon} ${message}`;
    statusMessage.style.display = 'flex';
    
    if (type !== 'error') {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 5000);
    }
  }
  
  function hienThiTienTrinh(percent, text) {
    progressContainer.style.display = 'block';
    progressBar.style.width = percent + '%';
    progressBar.textContent = text || percent + '%';
  }
  
  function anTienTrinh() {
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
  }
  
  function hienThiThongKe(stats) {
    statRequests.textContent = stats.requestCount || 0;
    statResources.textContent = stats.fileCount || 0;
    statTime.textContent = formatTime(stats.captureTime);
    statSize.textContent = stats.fileSize || '0 B';
    statsPanel.classList.add('show');
    
    // Tự động ẩn sau 10 giây
    setTimeout(() => {
      statsPanel.classList.remove('show');
    }, 10000);
  }
  
  function formatTime(ms) {
    if (ms < 1000) return ms + 'ms';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return minutes + 'm ' + (seconds % 60) + 's';
    }
    return seconds + 's';
  }
  
  function guiTinNhanh(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }
});