function updateFileProgress(percent) {
  elements.fileProgress.style.width = `${percent}%`;
}

function updateFileList() {
  const fileList = elements.fileList;
  fileList.innerHTML = '';
  
  if (state.transferredFiles.length === 0) {
    fileList.innerHTML = '<div class="no-events">No files transferred yet</div>';
    return;
  }
  
  // Sort by timestamp (newest first)
  const files = [...state.transferredFiles].sort((a, b) => b.timestamp - a.timestamp);
  
  files.forEach(file => {
    const fileItem = templates.fileItem.content.cloneNode(true);
    const item = fileItem.querySelector('.log-entry');
    
    item.querySelector('.font-bold').textContent = file.name;
    item.querySelector('.text-secondary').textContent = `${utils.formatTimestamp(file.timestamp)} - ${utils.formatBytes(file.size)} - ${file.direction === 'outgoing' ? 'Sent' : 'Received'}`;
    
    const button = item.querySelector('.btn');
    button.textContent = 'Download';
    button.addEventListener('click', () => {
      // Download functionality would go here
      // For sent files, we'd need to create a blob from the file
      // For received files, we'd already have the blob
      logger.info(`Download requested for file: ${file.name}`);
    });
    
    fileList.appendChild(item);
  });
}

function getIceServersFromUI() {
  const iceServers = [];
  const iceServerElements = elements.iceServersList.querySelectorAll('.form-group');
  
  iceServerElements.forEach(serverElement => {
    const urlElement = serverElement.querySelector('.ice-url');
    const usernameElement = serverElement.querySelector('.ice-username');
    const credentialElement = serverElement.querySelector('.ice-credential');
    
    if (urlElement && urlElement.value) {
      const server = {
        urls: urlElement.value
      };
      
      if (usernameElement && usernameElement.value) {
        server.username = usernameElement.value;
      }
      
      if (credentialElement && credentialElement.value) {
        server.credential = credentialElement.value;
      }
      
      iceServers.push(server);
    }
  });
  
  if (iceServers.length === 0) {
    // Use default if none specified
    return state.iceServers;
  }
  
  return iceServers;
}

function getStateEventType(state) {
  if (state === 'connected' || state === 'completed') {
    return 'success';
  } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
    return 'error';
  } else if (state === 'checking') {
    return 'info';
  } else {
    return 'warning';
  }
}

// Handle Theme Toggle
function toggleTheme() {
  const body = document.body;
  if (body.classList.contains('light-theme')) {
    body.classList.remove('light-theme');
    elements.themeIcon.textContent = '🌙'; // moon icon
    state.theme = 'dark';
  } else {
    body.classList.add('light-theme');
    elements.themeIcon.textContent = '☀️'; // sun icon
    state.theme = 'light';
  }
  
  // Update charts for new theme
  bandwidthChart.update();
  messageSizeChart.update();
}

// Console command handler
function handleConsoleCommand(command) {
  if (!command.startsWith('/')) {
    return `Unknown command: ${command}. Type /help for available commands.`;
  }
  
  const parts = command.slice(1).split(' ');
  const cmd = parts[0];
  const args = parts.slice(1);
  
  if (consoleCommands[cmd]) {
    return consoleCommands[cmd](args);
  } else {
    return `Unknown command: ${cmd}. Type /help for available commands.`;
  }
}

// Configuration export/import
function saveConfiguration() {
  const config = {
    iceServers: getIceServersFromUI(),
    signaling: {
      url: elements.signalingUrl.value || state.signaling.url,
      protocol: elements.signalingProtocol.value || state.signaling.protocol
    },
    autoReconnect: elements.autoReconnect.value === 'true',
    debugMode: state.debugMode,
    theme: state.theme
  };
  
  utils.downloadText(`webrtc-config-${new Date().toISOString()}.json`, JSON.stringify(config, null, 2));
  logger.success('Configuration saved');
}

function loadConfiguration() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const config = JSON.parse(event.target.result);
          applyConfiguration(config);
          logger.success('Configuration loaded');
        } catch (err) {
          logger.error(`Error loading configuration: ${err.message}`);
        }
      };
      reader.readAsText(file);
    }
  };
  
  input.click();
}

function applyConfiguration(config) {
  // Apply ICE servers
  if (config.iceServers && Array.isArray(config.iceServers)) {
    // Clear existing servers
    elements.iceServersList.innerHTML = '';
    
    // Add each server
    config.iceServers.forEach(server => {
      const iceServerTemplate = templates.iceServer.content.cloneNode(true);
      const serverElement = iceServerTemplate.querySelector('.form-group');
      
      serverElement.querySelector('.ice-url').value = server.urls;
      
      if (server.username) {
        serverElement.querySelector('.ice-username').value = server.username;
      }
      
      if (server.credential) {
        serverElement.querySelector('.ice-credential').value = server.credential;
      }
      
      elements.iceServersList.appendChild(serverElement);
    });
  }
  
  // Apply signaling settings
  if (config.signaling) {
    if (config.signaling.url) {
      elements.signalingUrl.value = config.signaling.url;
    }
    
    if (config.signaling.protocol) {
      elements.signalingProtocol.value = config.signaling.protocol;
    }
  }
  
  // Apply auto reconnect
  if (config.autoReconnect !== undefined) {
    elements.autoReconnect.value = config.autoReconnect ? 'true' : 'false';
  }
  
  // Apply debug mode
  if (config.debugMode !== undefined) {
    state.debugMode = config.debugMode;
  }
  
  // Apply theme
  if (config.theme) {
    if (config.theme === 'light' && state.theme !== 'light') {
      toggleTheme();
    } else if (config.theme === 'dark' && state.theme !== 'dark') {
      toggleTheme();
    }
  }
}

// Set up charts
let bandwidthChart, messageSizeChart;

function initCharts() {
  // Bandwidth chart
  bandwidthChart = new Chart(elements.bandwidthChart, {
    data: {
      labels: state.statsHistory.timestamps,
      datasets: [
        {
          label: 'Received',
          data: state.statsHistory.bytesReceived,
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true
        },
        {
          label: 'Sent',
          data: state.statsHistory.bytesSent,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          fill: true
        }
      ]
    }
  });
  
  // Message size chart
  messageSizeChart = new Chart(elements.messageSizeChart, {
    data: {
      labels: state.messageHistory.timestamps,
      datasets: [
        {
          label: 'Incoming',
          data: state.messageHistory.incomingSizes,
          borderColor: '#ff9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          fill: true
        },
        {
          label: 'Outgoing',
          data: state.messageHistory.outgoingSizes,
          borderColor: '#f44336',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          fill: true
        }
      ]
    }
  });
}

// Event Listeners
function initEventListeners() {
  // Connection button
  elements.connectionBtn.addEventListener('click', () => {
    if (state.connected) {
      disconnect();
    } else {
      connect();
    }
  });
  
  // Theme toggle
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Send button
  elements.sendBtn.addEventListener('click', () => {
    const message = elements.messageInput.value;
    if (message.trim()) {
      sendMessage(message);
      elements.messageInput.value = '';
    }
  });
  
  // Message input enter key
  elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const message = elements.messageInput.value;
      if (message.trim()) {
        sendMessage(message);
        elements.messageInput.value = '';
      }
    }
  });
  
  // Clear log button
  elements.clearLogBtn.addEventListener('click', () => {
    logger.clear();
  });
  
  // Export log button
  elements.exportLogBtn.addEventListener('click', () => {
    logger.export();
  });
  
  // File drop zone
  elements.fileDrop.addEventListener('click', () => {
    elements.fileInput.click();
  });
  
  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      sendFile(file);
      e.target.value = null; // Reset input
    }
  });
  
  elements.fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.fileDrop.classList.add('dragging');
  });
  
  elements.fileDrop.addEventListener('dragleave', () => {
    elements.fileDrop.classList.remove('dragging');
  });
  
  elements.fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.fileDrop.classList.remove('dragging');
    
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      sendFile(file);
    }
  });
  
  // Template buttons
  elements.templateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const template = btn.dataset.template;
      if (state.templates[template]) {
        elements.templateEditor.value = state.templates[template];
      }
    });
  });
  
  // Send template button
  elements.sendTemplateBtn.addEventListener('click', () => {
    const template = elements.templateEditor.value;
    if (template.trim()) {
      sendMessage(template);
    }
  });
  
  // Console input
  elements.consoleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const command = elements.consoleInput.value;
      if (command.trim()) {
        // Add command to console output
        const consoleOutput = document.createElement('div');
        consoleOutput.className = 'log-entry';
        consoleOutput.innerHTML = `
          <span class="log-timestamp">${utils.formatTimestamp(Date.now())}</span>
          <span class="log-message" style="color:var(--accent);">> ${command}</span>
        `;
        elements.consoleOutput.appendChild(consoleOutput);
        
        // Execute command
        const result = handleConsoleCommand(command);
        
        // Add result to console output
        const resultOutput = document.createElement('div');
        resultOutput.className = 'log-entry';
        resultOutput.innerHTML = `
          <span class="log-timestamp">${utils.formatTimestamp(Date.now())}</span>
          <span class="log-message">${result}</span>
        `;
        elements.consoleOutput.appendChild(resultOutput);
        
        // Clear input and scroll to bottom
        elements.consoleInput.value = '';
        elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
      }
    }
  });
  
  // Clear timeline button
  elements.clearTimelineBtn.addEventListener('click', () => {
    timeline.clear();
  });
  
  // Clear inspector button
  elements.clearInspectorBtn.addEventListener('click', () => {
    messageInspector.clear();
  });
  
  // Pause stats button
  elements.pauseStatsBtn.addEventListener('click', () => {
    if (state.statsInterval) {
      stopStatsCollection();
      elements.pauseStatsBtn.textContent = '▶️';
      elements.pauseStatsBtn.dataset.tooltip = 'Resume';
    } else {
      startStatsCollection();
      elements.pauseStatsBtn.textContent = '⏸️';
      elements.pauseStatsBtn.dataset.tooltip = 'Pause';
    }
  });
  
  // Pause size chart button
  elements.pauseSizeBtn.addEventListener('click', () => {
    // Toggle updating of message size chart
    const btn = elements.pauseSizeBtn;
    if (btn.textContent === '⏸️') {
      btn.textContent = '▶️';
      btn.dataset.tooltip = 'Resume';
      // We would pause updating here
    } else {
      btn.textContent = '⏸️';
      btn.dataset.tooltip = 'Pause';
      // We would resume updating here
    }
  });
  
  // Add ICE server button
  elements.addIceServerBtn.addEventListener('click', () => {
    const iceServerTemplate = templates.iceServer.content.cloneNode(true);
    elements.iceServersList.appendChild(iceServerTemplate);
    
    // Add event listener to the remove button
    const removeBtn = elements.iceServersList.lastElementChild.querySelector('.remove-ice');
    removeBtn.addEventListener('click', (e) => {
      e.target.closest('.form-group').remove();
    });
  });
  
  // Add remove ICE server listeners to existing buttons
  elements.iceServersList.querySelectorAll('.remove-ice').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.form-group').remove();
    });
  });
  
  // Apply ICE configuration button
  elements.applyIceConfigBtn.addEventListener('click', () => {
    // This would reinitialize the peer connection with the new ICE servers
    logger.info('ICE configuration applied. Reconnect to use new settings.');
  });
  
  // Create channel button
  elements.createChannelBtn.addEventListener('click', () => {
    const name = elements.channelName.value || 'chat';
    const ordered = elements.channelOrdered.value === 'true';
    const maxRetransmits = elements.channelMaxRetransmits.value ? parseInt(elements.channelMaxRetransmits.value) : null;
    
    if (state.peerConnection && state.peerConnection.connectionState === 'connected') {
      createDataChannel(name, { ordered, maxRetransmits });
    } else {
      logger.error('Cannot create channel: Peer connection not established');
    }
  });
  
  // Apply signaling button
  elements.applySignalingBtn.addEventListener('click', () => {
    state.signaling.url = elements.signalingUrl.value || state.signaling.url;
    state.signaling.protocol = elements.signalingProtocol.value || state.signaling.protocol;
    state.autoReconnect = elements.autoReconnect.value === 'true';
    
    logger.info('Signaling configuration applied. Reconnect to use new settings.');
  });
  
  // Save config button
  elements.saveConfigBtn.addEventListener('click', saveConfiguration);
  
  // Load config button
  elements.loadConfigBtn.addEventListener('click', loadConfiguration);
  
  // Tab navigation
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      
      // Update active tab
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active content
      elements.tabContents.forEach(content => {
        if (content.id === tabName) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
}

// Initialize the application
function init() {
  // Load default config
  elements.signalingUrl.value = state.signaling.url;
  elements.signalingProtocol.value = state.signaling.protocol;
  elements.autoReconnect.value = state.autoReconnect ? 'true' : 'false';
  
  // Initialize charts
  initCharts();
  
  // Initialize event listeners
  initEventListeners();
  
  // Update UI
  updateStatusIndicators();
  updateChannelsList();
  
  logger.info('WebRTC Debugger initialized');
  timeline.addEvent('Application Initialized', 'WebRTC Debugger ready', 'info');
}

// Start the application
window.addEventListener('DOMContentLoaded', init);// Application State
const state = {
  theme: 'dark',
  connected: false,
  ws: null,
  peerConnection: null,
  dataChannels: {},
  activeDataChannel: null,
  iceCandidatesBuffer: [],
  messageQueue: [],
  receivedMessages: [],
  sentMessages: [],
  connectionEvents: [],
  bytesReceived: 0,
  bytesSent: 0,
  roundTripTime: 0,
  statsInterval: null,
  statsHistory: {
    timestamps: [],
    bytesReceived: [],
    bytesSent: [],
    rtt: []
  },
  messageHistory: {
    timestamps: [],
    incomingSizes: [],
    outgoingSizes: []
  },
  debugMode: false,
  autoReconnect: true,
  signaling: {
    url: `ws://${location.host}`,
    protocol: 'json'
  },
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "turn:192.168.3.53:3478",
      username: "test",
      credential: "test123"
    }
  ],
  templates: {
    ping: JSON.stringify({ type: 'ping', timestamp: Date.now() }),
    echo: JSON.stringify({ type: 'echo', message: 'Please echo this message back' }),
    large: JSON.stringify({ 
      type: 'large', 
      data: Array(100).fill(0).map((_, i) => ({ id: i, value: `Item ${i}`, timestamp: Date.now() }))
    }),
    stress: JSON.stringify({ type: 'stress', repeats: 10, delay: 100 }),
    binary: 'Binary data example - will be converted to ArrayBuffer'
  },
  pendingFiles: [],
  transferredFiles: []
};

// DOM Elements
const elements = {
  // Status indicators
  wsStatus: document.getElementById('wsStatus'),
  peerStatus: document.getElementById('peerStatus'),
  channelStatus: document.getElementById('channelStatus'),
  bytesReceived: document.getElementById('bytesReceived'),
  bytesSent: document.getElementById('bytesSent'),
  rtt: document.getElementById('rtt'),
  
  // Messaging tab
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  logContainer: document.getElementById('logContainer'),
  logContent: document.getElementById('logContent'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  exportLogBtn: document.getElementById('exportLogBtn'),
  queueBadge: document.getElementById('queueBadge'),
  
  // File transfer tab
  fileDrop: document.getElementById('fileDrop'),
  fileInput: document.getElementById('fileInput'),
  fileProgress: document.getElementById('fileProgress'),
  fileStatus: document.getElementById('fileStatus'),
  fileList: document.getElementById('fileList'),
  
  // Templates tab
  templateBtns: document.querySelectorAll('.template-btn'),
  templateEditor: document.getElementById('templateEditor'),
  sendTemplateBtn: document.getElementById('sendTemplateBtn'),
  
  // Console tab
  consoleInput: document.getElementById('consoleInput'),
  consoleOutput: document.getElementById('consoleOutput'),
  
  // Charts
  bandwidthChart: document.getElementById('bandwidthChart'),
  messageSizeChart: document.getElementById('messageSizeChart'),
  pauseStatsBtn: document.getElementById('pauseStatsBtn'),
  pauseSizeBtn: document.getElementById('pauseSizeBtn'),
  
  // Timeline and inspector
  timeline: document.getElementById('timeline'),
  clearTimelineBtn: document.getElementById('clearTimelineBtn'),
  messageInspector: document.getElementById('messageInspector'),
  clearInspectorBtn: document.getElementById('clearInspectorBtn'),
  
  // Configuration
  iceServersList: document.getElementById('iceServersList'),
  addIceServerBtn: document.getElementById('addIceServerBtn'),
  applyIceConfigBtn: document.getElementById('applyIceConfigBtn'),
  channelsList: document.getElementById('channelsList'),
  createChannelBtn: document.getElementById('createChannelBtn'),
  channelName: document.getElementById('channelName'),
  channelOrdered: document.getElementById('channelOrdered'),
  channelMaxRetransmits: document.getElementById('channelMaxRetransmits'),
  
  // Signaling
  signalingUrl: document.getElementById('signalingUrl'),
  signalingProtocol: document.getElementById('signalingProtocol'),
  autoReconnect: document.getElementById('autoReconnect'),
  applySignalingBtn: document.getElementById('applySignalingBtn'),
  
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  // Other controls
  themeToggle: document.getElementById('themeToggle'),
  themeIcon: document.getElementById('themeIcon'),
  connectionBtn: document.getElementById('connectionBtn'),
  connectionBtnText: document.getElementById('connectionBtnText'),
  connectionBtnIcon: document.getElementById('connectionBtnIcon'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  loadConfigBtn: document.getElementById('loadConfigBtn')
};

// Templates
const templates = {
  iceServer: document.getElementById('iceServerTemplate'),
  logEntry: document.getElementById('logEntryTemplate'),
  timelineEvent: document.getElementById('timelineEventTemplate'),
  messageDetail: document.getElementById('messageDetailTemplate'),
  channelItem: document.getElementById('channelItemTemplate'),
  fileItem: document.getElementById('fileItemTemplate')
};

// Utility Functions
const utils = {
  formatBytes: (bytes, decimals = 2) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },
  
  formatTimestamp: (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  },
  
  getMessageSize: (message) => {
    if (typeof message === 'string') {
      return new Blob([message]).size;
    } else if (message instanceof ArrayBuffer || message instanceof Blob) {
      return message.byteLength || message.size;
    } else {
      try {
        return new Blob([JSON.stringify(message)]).size;
      } catch (e) {
        return 0;
      }
    }
  },
  
  truncateText: (text, maxLength = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
  
  downloadText: (filename, text) => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  },
  
  formatJson: (json) => {
    try {
      if (typeof json === 'string') {
        return JSON.stringify(JSON.parse(json), null, 2);
      } else {
        return JSON.stringify(json, null, 2);
      }
    } catch (e) {
      return json;
    }
  },
  
  arrayBufferToString: (buffer) => {
    return new TextDecoder().decode(buffer);
  },
  
  stringToArrayBuffer: (str) => {
    return new TextEncoder().encode(str).buffer;
  },
  
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
};

// Logger
const LOG_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

const logger = {
  log: (message, type = LOG_TYPES.INFO) => {
    const timestamp = Date.now();
    const logEntry = templates.logEntry.content.cloneNode(true);
    const entry = logEntry.querySelector('.log-entry');
    
    entry.querySelector('.log-timestamp').textContent = utils.formatTimestamp(timestamp);
    
    const typeSpan = entry.querySelector('.log-type');
    typeSpan.textContent = type.toUpperCase();
    typeSpan.classList.add(`type-${type}`);
    
    entry.querySelector('.log-message').textContent = message;
    
    elements.logContent.appendChild(entry);
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
    
    if (state.debugMode) {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    return {
      timestamp,
      type,
      message
    };
  },
  
  info: (message) => logger.log(message, LOG_TYPES.INFO),
  success: (message) => logger.log(message, LOG_TYPES.SUCCESS),
  warning: (message) => logger.log(message, LOG_TYPES.WARNING),
  error: (message) => logger.log(message, LOG_TYPES.ERROR),
  
  clear: () => {
    elements.logContent.innerHTML = '';
  },
  
  export: () => {
    const logEntries = Array.from(elements.logContent.querySelectorAll('.log-entry')).map(entry => {
      const timestamp = entry.querySelector('.log-timestamp').textContent;
      const type = entry.querySelector('.log-type').textContent;
      const message = entry.querySelector('.log-message').textContent;
      return `[${timestamp}] [${type}] ${message}`;
    }).join('\n');
    
    utils.downloadText(`webrtc-log-${new Date().toISOString()}.txt`, logEntries);
  }
};

// Console Commands
const consoleCommands = {
  help: () => {
    return [
      'Available commands:',
      '/stats - Show connection statistics',
      '/reconnect - Force reconnection',
      '/create-channel [name] [ordered] [maxRetransmits] - Create a new data channel',
      '/close-channel [name] - Close a data channel',
      '/debug [on|off] - Toggle debug mode',
      '/help - Show this help message'
    ].join('\n');
  },
  
  stats: () => {
    if (!state.peerConnection) {
      return 'No active peer connection';
    }
    
    return [
      'Connection Statistics:',
      `WebSocket: ${state.ws && state.ws.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'}`,
      `Peer Connection: ${state.peerConnection ? state.peerConnection.connectionState : 'None'}`,
      `Active Data Channel: ${state.activeDataChannel ? state.activeDataChannel.label : 'None'}`,
      `Bytes Received: ${utils.formatBytes(state.bytesReceived)}`,
      `Bytes Sent: ${utils.formatBytes(state.bytesSent)}`,
      `Round Trip Time: ${state.roundTripTime} ms`,
      `ICE Candidates Buffered: ${state.iceCandidatesBuffer.length}`,
      `Message Queue Size: ${state.messageQueue.length}`
    ].join('\n');
  },
  
  reconnect: () => {
    disconnect();
    setTimeout(connect, 500);
    return 'Reconnecting...';
  },
  
  'create-channel': (args) => {
    const [name, orderedStr, maxRetransmitsStr] = args;
    
    if (!name) {
      return 'Usage: /create-channel [name] [ordered=true] [maxRetransmits]';
    }
    
    if (!state.peerConnection || state.peerConnection.connectionState !== 'connected') {
      return 'Cannot create channel: Peer connection not established';
    }
    
    const ordered = orderedStr ? orderedStr === 'true' : true;
    const maxRetransmits = maxRetransmitsStr ? parseInt(maxRetransmitsStr) : null;
    
    try {
      createDataChannel(name, { ordered, maxRetransmits });
      return `Created data channel "${name}" (ordered: ${ordered}, maxRetransmits: ${maxRetransmits || 'unlimited'})`;
    } catch (e) {
      return `Error creating data channel: ${e.message}`;
    }
  },
  
  'close-channel': (args) => {
    const [name] = args;
    
    if (!name) {
      return 'Usage: /close-channel [name]';
    }
    
    if (!state.dataChannels[name]) {
      return `Data channel "${name}" not found`;
    }
    
    try {
      state.dataChannels[name].close();
      return `Closed data channel "${name}"`;
    } catch (e) {
      return `Error closing data channel: ${e.message}`;
    }
  },
  
  debug: (args) => {
    const [mode] = args;
    
    if (mode === 'on') {
      state.debugMode = true;
      return 'Debug mode enabled';
    } else if (mode === 'off') {
      state.debugMode = false;
      return 'Debug mode disabled';
    } else {
      state.debugMode = !state.debugMode;
      return `Debug mode ${state.debugMode ? 'enabled' : 'disabled'}`;
    }
  }
};

// Timeline
const timeline = {
  addEvent: (title, details, type = 'info') => {
    const timestamp = Date.now();
    const timelineEvent = templates.timelineEvent.content.cloneNode(true);
    const event = timelineEvent.querySelector('.timeline-event');
    
    event.classList.add(type);
    event.querySelector('.timeline-time').textContent = utils.formatTimestamp(timestamp);
    event.querySelector('.timeline-title').textContent = title;
    event.querySelector('.timeline-details').textContent = details || '';
    
    // Check if there are no events yet
    const noEvents = elements.timeline.querySelector('.no-events');
    if (noEvents) {
      elements.timeline.innerHTML = '';
    }
    
    elements.timeline.appendChild(event);
    
    state.connectionEvents.push({
      timestamp,
      title,
      details,
      type
    });
    
    return {
      timestamp,
      title,
      details,
      type
    };
  },
  
  clear: () => {
    elements.timeline.innerHTML = '<div class="no-events">No connection events yet</div>';
    state.connectionEvents = [];
  }
};

// Message Inspector
const messageInspector = {
  addMessage: (message, direction, raw) => {
    const timestamp = Date.now();
    const messageSize = utils.getMessageSize(raw);
    
    const messageDetail = templates.messageDetail.content.cloneNode(true);
    const detail = messageDetail.querySelector('.message-detail');
    
    detail.querySelector('.message-detail-type').textContent = direction === 'incoming' ? '📩 Received' : '📤 Sent';
    detail.querySelector('.message-detail-time').textContent = utils.formatTimestamp(timestamp);
    detail.querySelector('.message-detail-size').textContent = `Size: ${utils.formatBytes(messageSize)}`;
    
    let content;
    if (typeof raw === 'string') {
      try {
        content = utils.formatJson(raw);
      } catch (e) {
        content = raw;
      }
    } else if (raw instanceof ArrayBuffer) {
      try {
        const text = utils.arrayBufferToString(raw);
        content = `ArrayBuffer (${raw.byteLength} bytes): ${utils.truncateText(text, 500)}`;
      } catch (e) {
        content = `ArrayBuffer (${raw.byteLength} bytes): Binary data`;
      }
    } else if (raw instanceof Blob) {
      content = `Blob (${raw.size} bytes): ${raw.type}`;
    } else {
      content = String(raw);
    }
    
    detail.querySelector('.message-detail-content').textContent = content;
    
    // Check if there are no messages yet
    const noMessages = elements.messageInspector.querySelector('.no-events');
    if (noMessages) {
      elements.messageInspector.innerHTML = '';
    }
    
    elements.messageInspector.appendChild(detail);
    elements.messageInspector.scrollTop = elements.messageInspector.scrollHeight;
    
    // Add to message history for charts
    if (direction === 'incoming') {
      state.receivedMessages.push({ timestamp, message, size: messageSize });
      state.messageHistory.incomingSizes.push(messageSize);
    } else {
      state.sentMessages.push({ timestamp, message, size: messageSize });
      state.messageHistory.outgoingSizes.push(messageSize);
    }
    
    state.messageHistory.timestamps.push(utils.formatTimestamp(timestamp));
    
    // Keep last 20 points in charts
    if (state.messageHistory.timestamps.length > 20) {
      state.messageHistory.timestamps.shift();
      state.messageHistory.incomingSizes.shift();
      state.messageHistory.outgoingSizes.shift();
    }
    
    // Update message size chart
    messageSizeChart.update();
    
    return {
      timestamp,
      direction,
      message,
      size: messageSize
    };
  },
  
  clear: () => {
    elements.messageInspector.innerHTML = '<div class="no-events">No messages to inspect</div>';
    state.receivedMessages = [];
    state.sentMessages = [];
  }
};

// WebRTC Functions
function connect() {
  if (state.connected) {
    logger.warning('Already connected');
    return;
  }
  
  logger.info('Connecting to signaling server...');
  timeline.addEvent('Connection Started', 'Connecting to signaling server');
  
  // Update signaling URL if specified
  const signalingUrl = elements.signalingUrl.value || state.signaling.url;
  
  try {
    state.ws = new WebSocket(signalingUrl);
    state.ws.binaryType = 'blob';
    
    state.ws.onopen = () => {
      logger.success('WebSocket connected');
      timeline.addEvent('WebSocket Connected', signalingUrl, 'success');
      updateStatusIndicators();
      
      // Create peer connection now that websocket is ready
      createPeerConnection();
    };
    
    state.ws.onerror = (e) => {
      logger.error(`WebSocket error: ${e.type}`);
      timeline.addEvent('WebSocket Error', e.type, 'error');
      updateStatusIndicators();
    };
    
    state.ws.onclose = () => {
      logger.warning('WebSocket disconnected');
      timeline.addEvent('WebSocket Disconnected', 'Connection closed', 'warning');
      updateStatusIndicators();
      
      if (state.autoReconnect && state.connected) {
        logger.info('Attempting to reconnect in 3 seconds...');
        setTimeout(connect, 3000);
      }
      
      disconnect();
    };
    
    state.ws.onmessage = handleSignalingMessage;
    
    // Update UI
    elements.connectionBtnText.textContent = 'Disconnect';
    elements.connectionBtnIcon.textContent = '🔌';
    state.connected = true;
    
    // Start collecting stats
    startStatsCollection();
  } catch (e) {
    logger.error(`Connection error: ${e.message}`);
    timeline.addEvent('Connection Error', e.message, 'error');
  }
}

function disconnect() {
  // Close WebSocket
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  
  // Close peer connection
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  
  // Clear data channels
  for (const channelName in state.dataChannels) {
    if (state.dataChannels[channelName]) {
      state.dataChannels[channelName].close();
    }
  }
  state.dataChannels = {};
  state.activeDataChannel = null;
  
  // Update state
  state.connected = false;
  state.iceCandidatesBuffer = [];
  
  // Stop stats collection
  stopStatsCollection();
  
  // Update UI
  elements.connectionBtnText.textContent = 'Connect';
  elements.connectionBtnIcon.textContent = '🔄';
  updateStatusIndicators();
  updateChannelsList();
  
  logger.info('Disconnected');
  timeline.addEvent('Disconnected', 'Connection closed', 'warning');
}

async function handleSignalingMessage(event) {
  let message;
  
  // Handle different data types from WebSocket
  if (typeof event.data === 'string') {
    try {
      message = JSON.parse(event.data);
      messageInspector.addMessage(message, 'incoming', event.data);
    } catch (e) {
      logger.error(`Error parsing WebSocket message: ${e.message}`);
      return;
    }
  } else if (event.data instanceof Blob) {
    try {
      const text = await event.data.text();
      logger.info('Received blob data from WebSocket');
      message = JSON.parse(text);
      messageInspector.addMessage(message, 'incoming', text);
    } catch (e) {
      logger.error(`Error processing WebSocket blob data: ${e.message}`);
      return;
    }
  } else {
    logger.warning('Received unknown data type from WebSocket');
    return;
  }
  
  logger.info(`Received signaling: ${message.type}`);
  
  // Update bytes received
  state.bytesReceived += utils.getMessageSize(event.data);
  updateStatsDisplay();
  
  if (message.type === 'offer') {
    // Handle offer
    try {
      // Create new peer connection if needed
      if (!state.peerConnection) {
        createPeerConnection();
      } else if (state.peerConnection.signalingState !== 'stable') {
        logger.warning('Closing existing peer connection before creating new one');
        state.peerConnection.close();
        createPeerConnection();
      }
      
      await state.peerConnection.setRemoteDescription(message);
      logger.success('Remote description set (offer)');
      timeline.addEvent('Received Offer', 'Remote description set', 'info');
      
      // Process any buffered candidates
      await processBufferedCandidates();
      
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);
      logger.success('Local description set (answer)');
      
      // Send answer
      sendSignalingMessage(state.peerConnection.localDescription);
      timeline.addEvent('Sent Answer', 'Created and sent answer', 'success');
    } catch (err) {
      logger.error(`Error handling offer: ${err.message}`);
      timeline.addEvent('Offer Error', err.message, 'error');
    }
  } else if (message.type === 'answer') {
    // Handle answer
    try {
      if (!state.peerConnection) {
        logger.error('Received answer but peer connection doesn\'t exist');
        return;
      }
      
      await state.peerConnection.setRemoteDescription(message);
      logger.success('Remote description set (answer)');
      timeline.addEvent('Received Answer', 'Remote description set', 'success');
      
      // Process any buffered candidates
      await processBufferedCandidates();
    } catch (err) {
      logger.error(`Error setting remote description: ${err.message}`);
      timeline.addEvent('Answer Error', err.message, 'error');
    }
  } else if (message.type === 'candidate') {
    // Handle ICE candidate
    if (!state.peerConnection) {
      logger.error('Received ICE candidate but peer connection doesn\'t exist yet');
      return;
    }
    
    if (message.candidate) {
      try {
        // Check if remote description is set
        if (state.peerConnection.remoteDescription && state.peerConnection.remoteDescription.type) {
          // If remote description is set, add the candidate immediately
          await state.peerConnection.addIceCandidate(message.candidate);
          logger.success('Added ICE candidate');
          timeline.addEvent('Added ICE Candidate', `${message.candidate.candidate}`, 'info');
        } else {
          // Otherwise, buffer the candidate for later
          state.iceCandidatesBuffer.push(message.candidate);
          logger.warning(`Buffered ICE candidate (waiting for remote description) - Total: ${state.iceCandidatesBuffer.length}`);
          timeline.addEvent('Buffered ICE Candidate', `Total buffered: ${state.iceCandidatesBuffer.length}`, 'warning');
        }
      } catch (e) {
        logger.error(`Error handling ICE candidate: ${e.message}`);
        timeline.addEvent('ICE Candidate Error', e.message, 'error');
      }
    }
  }
}

function createPeerConnection() {
  // Get ICE servers from UI
  const iceServers = getIceServersFromUI();
  
  // Create configuration
  const config = {
    iceServers: iceServers
  };
  
  // Create peer connection
  state.peerConnection = new RTCPeerConnection(config);
  
  // Set up event handlers
  state.peerConnection.oniceconnectionstatechange = () => {
    const iceState = state.peerConnection.iceConnectionState;
    logger.info(`ICE connection state: ${iceState}`);
    timeline.addEvent('ICE State Change', iceState, getStateEventType(iceState));
    updateStatusIndicators();
  };
  
  state.peerConnection.onconnectionstatechange = () => {
    const connState = state.peerConnection.connectionState;
    logger.info(`Connection state: ${connState}`);
    timeline.addEvent('Connection State Change', connState, getStateEventType(connState));
    updateStatusIndicators();
    
    // Process message queue when connected
    if (connState === 'connected') {
      processPendingMessages();
    }
  };
  
  state.peerConnection.ondatachannel = (event) => {
    const channel = event.channel;
    logger.success(`Received data channel: ${channel.label}`);
    timeline.addEvent('Received Data Channel', channel.label, 'success');
    
    setupDataChannel(channel);
  };
  
  state.peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignalingMessage({ type: 'candidate', candidate: e.candidate });
      logger.info('Sent ICE candidate');
    }
  };
  
  // Create data channel (as offerer)
  const channelName = elements.channelName.value || 'chat';
  const ordered = elements.channelOrdered.value === 'true';
  const maxRetransmits = elements.channelMaxRetransmits.value ? parseInt(elements.channelMaxRetransmits.value) : null;
  
  createDataChannel(channelName, { ordered, maxRetransmits });
  
  logger.success('Created peer connection');
  timeline.addEvent('Created Peer Connection', 'RTCPeerConnection initialized', 'success');
  
  // Start as offerer
  startOfferer();
}

function createDataChannel(name, options = {}) {
  if (!state.peerConnection) {
    logger.error('Cannot create data channel: Peer connection not initialized');
    return;
  }
  
  try {
    const channel = state.peerConnection.createDataChannel(name, options);
    logger.success(`Created data channel: ${name}`);
    timeline.addEvent('Created Data Channel', `${name} (ordered: ${options.ordered !== false}, maxRetransmits: ${options.maxRetransmits || 'unlimited'})`, 'success');
    
    setupDataChannel(channel);
    return channel;
  } catch (e) {
    logger.error(`Error creating data channel: ${e.message}`);
    timeline.addEvent('Data Channel Error', e.message, 'error');
    return null;
  }
}

function setupDataChannel(channel) {
  channel.binaryType = 'arraybuffer';
  
  channel.onopen = () => {
    logger.success(`Data channel opened: ${channel.label}`);
    timeline.addEvent('Data Channel Open', channel.label, 'success');
    updateStatusIndicators();
    updateChannelsList();
    
    // Set as active channel if this is the first one
    if (!state.activeDataChannel) {
      state.activeDataChannel = channel;
    }
    
    // Process any pending messages
    processPendingMessages();
  };
  
  channel.onclose = () => {
    logger.warning(`Data channel closed: ${channel.label}`);
    timeline.addEvent('Data Channel Closed', channel.label, 'warning');
    updateStatusIndicators();
    updateChannelsList();
    
    // If this was the active channel, find another
    if (state.activeDataChannel === channel) {
      for (const channelName in state.dataChannels) {
        if (state.dataChannels[channelName] && state.dataChannels[channelName].readyState === 'open') {
          state.activeDataChannel = state.dataChannels[channelName];
          break;
        }
      }
    }
  };
  
  channel.onerror = (err) => {
    logger.error(`Data channel error (${channel.label}): ${err}`);
    timeline.addEvent('Data Channel Error', `${channel.label}: ${err}`, 'error');
    updateStatusIndicators();
  };
  
  channel.onmessage = async (e) => {
    let messageContent;
    let messageSize = 0;
    
    if (typeof e.data === 'string') {
      messageContent = e.data;
      messageSize = e.data.length;
      logger.info(`Received message (${utils.formatBytes(messageSize)}): ${utils.truncateText(e.data)}`);
      messageInspector.addMessage(messageContent, 'incoming', e.data);
    } else if (e.data instanceof ArrayBuffer) {
      messageSize = e.data.byteLength;
      try {
        messageContent = utils.arrayBufferToString(e.data);
        logger.info(`Received ArrayBuffer (${utils.formatBytes(messageSize)}): ${utils.truncateText(messageContent)}`);
      } catch (err) {
        messageContent = `Binary data (${utils.formatBytes(messageSize)})`;
        logger.info(`Received binary data: ${utils.formatBytes(messageSize)}`);
      }
      messageInspector.addMessage(messageContent, 'incoming', e.data);
    } else if (e.data instanceof Blob) {
      messageSize = e.data.size;
      try {
        const text = await e.data.text();
        messageContent = text;
        logger.info(`Received Blob (${utils.formatBytes(messageSize)}): ${utils.truncateText(text)}`);
      } catch (err) {
        messageContent = `Blob data (${utils.formatBytes(messageSize)})`;
        logger.info(`Received blob data: ${utils.formatBytes(messageSize)}`);
      }
      messageInspector.addMessage(messageContent, 'incoming', e.data);
    } else {
      messageContent = `Unknown data type`;
      logger.info(`Received unknown data type`);
    }
    
    // Update bytes received
    state.bytesReceived += messageSize;
    updateStatsDisplay();
  };
  
  // Store channel in state
  state.dataChannels[channel.label] = channel;
}

function startOfferer() {
  if (!state.peerConnection) {
    logger.error('Cannot start as offerer: Peer connection not initialized');
    return;
  }
  
  state.peerConnection.createOffer()
    .then(offer => {
      logger.info('Created offer');
      return state.peerConnection.setLocalDescription(offer);
    })
    .then(() => {
      logger.success('Local description set (offer)');
      timeline.addEvent('Created Offer', 'Local description set', 'success');
      
      sendSignalingMessage(state.peerConnection.localDescription);
      logger.success('Sent offer');
      timeline.addEvent('Sent Offer', 'Offer sent to signaling server', 'info');
    })
    .catch(err => {
      logger.error(`Offer creation error: ${err.message}`);
      timeline.addEvent('Offer Error', err.message, 'error');
    });
}

// Process buffered ICE candidates
async function processBufferedCandidates() {
  if (state.iceCandidatesBuffer.length > 0) {
    logger.info(`Processing ${state.iceCandidatesBuffer.length} buffered ICE candidates`);
    timeline.addEvent('Processing ICE Candidates', `${state.iceCandidatesBuffer.length} candidates`, 'info');
    
    const candidates = [...state.iceCandidatesBuffer];
    state.iceCandidatesBuffer = [];
    
    for (const candidate of candidates) {
      try {
        await state.peerConnection.addIceCandidate(candidate);
      } catch (e) {
        logger.error(`Error adding buffered ICE candidate: ${e.message}`);
        // Re-add to buffer if failed
        state.iceCandidatesBuffer.push(candidate);
      }
    }
    
    logger.success(`Processed buffered ICE candidates. ${state.iceCandidatesBuffer.length} remaining.`);
  }
}

// Message Queue
function queueMessage(message) {
  state.messageQueue.push(message);
  logger.warning(`Message queued (${state.messageQueue.length} pending)`);
  updateQueueBadge();
}

function processPendingMessages() {
  if (!state.activeDataChannel || state.activeDataChannel.readyState !== 'open') {
    return;
  }
  
  while (state.messageQueue.length > 0 && state.activeDataChannel.readyState === 'open') {
    const message = state.messageQueue.shift();
    sendMessage(message, false); // Don't re-queue if send fails
    logger.success(`Sent queued message`);
  }
  
  updateQueueBadge();
}

function updateQueueBadge() {
  if (state.messageQueue.length > 0) {
    elements.queueBadge.textContent = state.messageQueue.length;
    elements.queueBadge.classList.remove('hidden');
  } else {
    elements.queueBadge.classList.add('hidden');
  }
}

// Signaling
function sendSignalingMessage(message) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    logger.error('Cannot send signaling message: WebSocket not connected');
    return;
  }
  
  try {
    const protocol = elements.signalingProtocol.value || state.signaling.protocol;
    let data;
    
    if (protocol === 'json') {
      data = JSON.stringify(message);
    } else if (protocol === 'binary') {
      data = utils.stringToArrayBuffer(JSON.stringify(message));
    } else {
      data = JSON.stringify(message);
    }
    
    state.ws.send(data);
    messageInspector.addMessage(message, 'outgoing', data);
    
    // Update bytes sent
    state.bytesSent += utils.getMessageSize(data);
    updateStatsDisplay();
  } catch (e) {
    logger.error(`Error sending signaling message: ${e.message}`);
  }
}

// Sending messages through data channel
function sendMessage(message, queue = true) {
  if (!state.activeDataChannel) {
    logger.error('Cannot send message: No active data channel');
    if (queue) queueMessage(message);
    return false;
  }
  
  if (state.activeDataChannel.readyState !== 'open') {
    logger.warning(`Data channel not open (state: ${state.activeDataChannel.readyState})`);
    if (queue) queueMessage(message);
    return false;
  }
  
  try {
    state.activeDataChannel.send(message);
    
    // Log the message
    const messageSize = utils.getMessageSize(message);
    logger.success(`Sent message (${utils.formatBytes(messageSize)}): ${utils.truncateText(message)}`);
    messageInspector.addMessage(message, 'outgoing', message);
    
    // Update bytes sent
    state.bytesSent += messageSize;
    updateStatsDisplay();
    
    return true;
  } catch (err) {
    logger.error(`Error sending message: ${err.message}`);
    if (queue) queueMessage(message);
    return false;
  }
}

// File transfer
function sendFile(file) {
  if (!state.activeDataChannel) {
    logger.error('Cannot send file: No active data channel');
    return;
  }
  
  if (state.activeDataChannel.readyState !== 'open') {
    logger.warning(`Data channel not open (state: ${state.activeDataChannel.readyState})`);
    return;
  }
  
  const reader = new FileReader();
  let offset = 0;
  const chunkSize = 16384; // 16 KB chunks
  let fileId = Date.now();
  
  // Add to pending files
  state.pendingFiles.push({
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    progress: 0
  });
  
  // Update UI
  updateFileProgress(0);
  elements.fileStatus.textContent = `Sending ${file.name} (0%)`;
  
  // Send file info first
  const fileInfo = JSON.stringify({
    type: 'file-info',
    id: fileId,
    name: file.name,
    size: file.size,
    fileType: file.type
  });
  
  sendMessage(fileInfo);
  
  reader.onload = (e) => {
    if (!state.activeDataChannel) {
      logger.error('Data channel closed during file transfer');
      updateFileProgress(0);
      elements.fileStatus.textContent = '';
      return;
    }
    
    const chunk = e.target.result;
    state.activeDataChannel.send(chunk);
    
    offset += chunk.byteLength;
    const progress = Math.min(100, Math.round((offset / file.size) * 100));
    
    // Update progress
    updateFileProgress(progress);
    elements.fileStatus.textContent = `Sending ${file.name} (${progress}%)`;
    
    // Update pending file
    const pendingFile = state.pendingFiles.find(f => f.id === fileId);
    if (pendingFile) {
      pendingFile.progress = progress;
    }
    
    // Send the next chunk
    if (offset < file.size) {
      readSlice(offset);
    } else {
      // Complete
      logger.success(`File sent: ${file.name} (${utils.formatBytes(file.size)})`);
      timeline.addEvent('File Sent', `${file.name} (${utils.formatBytes(file.size)})`, 'success');
      
      // Send file-complete message
      sendMessage(JSON.stringify({
        type: 'file-complete',
        id: fileId
      }));
      
      // Remove from pending and add to transferred
      state.pendingFiles = state.pendingFiles.filter(f => f.id !== fileId);
      state.transferredFiles.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        timestamp: Date.now(),
        direction: 'outgoing'
      });
      
      // Update UI
      updateFileList();
      updateFileProgress(0);
      elements.fileStatus.textContent = '';
    }
  };
  
  reader.onerror = (err) => {
    logger.error(`Error reading file: ${err}`);
    updateFileProgress(0);
    elements.fileStatus.textContent = '';
  };
  
  function readSlice(start) {
    const slice = file.slice(start, start + chunkSize);
    reader.readAsArrayBuffer(slice);
  }
  
  // Start reading the file
  readSlice(0);
}

// Statistics
function startStatsCollection() {
  if (state.statsInterval) {
    clearInterval(state.statsInterval);
  }
  
  state.statsInterval = setInterval(collectStats, 1000);
}

function stopStatsCollection() {
  if (state.statsInterval) {
    clearInterval(state.statsInterval);
    state.statsInterval = null;
  }
}

async function collectStats() {
  if (!state.peerConnection) return;
  
  try {
    const stats = await state.peerConnection.getStats();
    let inboundRtpTotBytes = 0;
    let outboundRtpTotBytes = 0;
    let currentRtt = 0;
    
    stats.forEach(report => {
      if (report.type === 'inbound-rtp') {
        inboundRtpTotBytes += report.bytesReceived || 0;
      } else if (report.type === 'outbound-rtp') {
        outboundRtpTotBytes += report.bytesSent || 0;
      } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        currentRtt = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : 0;
      }
    });
    
    // Update state
    state.roundTripTime = currentRtt;
    
    // Update stats history (for charts)
    const timestamp = utils.formatTimestamp(Date.now());
    state.statsHistory.timestamps.push(timestamp);
    state.statsHistory.bytesReceived.push(state.bytesReceived);
    state.statsHistory.bytesSent.push(state.bytesSent);
    state.statsHistory.rtt.push(currentRtt);
    
    // Keep last 20 points in charts
    if (state.statsHistory.timestamps.length > 20) {
      state.statsHistory.timestamps.shift();
      state.statsHistory.bytesReceived.shift();
      state.statsHistory.bytesSent.shift();
      state.statsHistory.rtt.shift();
    }
    
    // Update display
    updateStatsDisplay();
    
    // Update charts
    bandwidthChart.update();
  } catch (e) {
    if (state.debugMode) {
      console.error('Error collecting stats:', e);
    }
  }
}

function updateStatsDisplay() {
  elements.bytesReceived.textContent = `Received: ${utils.formatBytes(state.bytesReceived)}`;
  elements.bytesSent.textContent = `Sent: ${utils.formatBytes(state.bytesSent)}`;
  elements.rtt.textContent = `RTT: ${state.roundTripTime} ms`;
}

// UI Functions
function updateStatusIndicators() {
  // WebSocket
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    elements.wsStatus.classList.add('connected');
  } else {
    elements.wsStatus.classList.remove('connected');
  }
  
  // Peer Connection
  if (state.peerConnection && (
      state.peerConnection.connectionState === 'connected' || 
      state.peerConnection.iceConnectionState === 'connected')) {
    elements.peerStatus.classList.add('connected');
  } else {
    elements.peerStatus.classList.remove('connected');
  }
  
  // Data Channel
  if (state.activeDataChannel && state.activeDataChannel.readyState === 'open') {
    elements.channelStatus.classList.add('connected');
  } else {
    elements.channelStatus.classList.remove('connected');
  }
}

function updateChannelsList() {
  const channelsList = elements.channelsList;
  channelsList.innerHTML = '';
  
  const channels = Object.values(state.dataChannels);
  
  if (channels.length === 0) {
    channelsList.innerHTML = '<div class="no-events">No data channels available</div>';
    return;
  }
  
  channels.forEach(channel => {
    const channelItem = templates.channelItem.content.cloneNode(true);
    const item = channelItem.querySelector('.form-group');
    
    item.querySelector('.channel-name').textContent = channel.label;
    item.querySelector('.channel-state').textContent = channel.readyState;
    item.querySelector('.channel-ordered').textContent = channel.ordered !== false ? 'Yes' : 'No';
    item.querySelector('.channel-retransmits').textContent = channel.maxRetransmits || 'unlimited';
    
    const statusDot = item.querySelector('.channel-status');
    if (channel.readyState === 'open') {
      statusDot.classList.add('connected');
    }
    
    const actionBtn = item.querySelector('.channel-action');
    
    if (channel === state.activeDataChannel) {
      actionBtn.textContent = 'Active';
      actionBtn.disabled = true;
    } else if (channel.readyState === 'open') {
      actionBtn.textContent = 'Use';
      actionBtn.addEventListener('click', () => {
        state.activeDataChannel = channel;
        updateChannelsList();
        logger.info(`Data channel "${channel.label}" set as active`);
      });
    } else if (channel.readyState === 'closed') {
      actionBtn.textContent = 'Reopen';
      actionBtn.addEventListener('click', () => {
        createDataChannel(channel.label, {
          ordered: channel.ordered,
          maxRetransmits: channel.maxRetransmits
        });
      });
    } else {
      actionBtn.textContent = 'Close';
      actionBtn.addEventListener('click', () => {
        channel.close();
        updateChannelsList();
      });
    }
    
    channelsList.appendChild(item);
  });
}