// Create counter element
const counter = document.createElement('div');
counter.className = 'emdash-counter';
counter.textContent = 'Dashes replaced: 0';
document.body.appendChild(counter);

let replacementCount = 0;
let counterTimeout;
let processingQueue = new Set();
let checkInterval;
let isPaused = false;
let unpauseTimeout;
let isCounterVisible = false;

// Function to update counter with animation
function updateCounter() {
  if (!isCounterVisible) {
    isCounterVisible = true;
    counter.classList.add('active');
  }
  counter.textContent = `Dashes replaced: ${replacementCount}`;
  
  clearTimeout(counterTimeout);
  counterTimeout = setTimeout(() => {
    isCounterVisible = false;
    counter.classList.remove('active');
    replacementCount = 0; // Reset the counter
  }, 1300);
}

// Function to process text content
function processTextContent(textContent) {
  const dashRegex = /[–—]/g;  // Directly match em and en dashes
  return {
    text: textContent.replace(dashRegex, '-'),
    count: (textContent.match(dashRegex) || []).length
  };
}

// Function to process a message node once it's complete
function processCompleteMessage(messageNode) {
  if (processingQueue.has(messageNode) || isPaused) {
    return; // Already processed, in queue, or paused
  }

  processingQueue.add(messageNode);

  // Process all text nodes within the message
  const walker = document.createTreeWalker(
    messageNode,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  let totalReplacements = 0;
  const nodesToReplace = [];

  // First pass: collect all nodes that need replacement
  while (node = walker.nextNode()) {
    const result = processTextContent(node.textContent);
    if (result.count > 0) {
      nodesToReplace.push({
        node,
        newText: result.text,
        count: result.count
      });
      totalReplacements += result.count;
    }
  }

  // Second pass: perform all replacements at once
  if (totalReplacements > 0) {
    nodesToReplace.forEach(({ node, newText }) => {
      const span = document.createElement('span');
      span.className = 'replaced-text';
      span.textContent = newText;
      node.parentNode.replaceChild(span, node);
      
      // Add fade class after a brief delay to trigger transition
      requestAnimationFrame(() => {
        // Force a reflow
        span.offsetHeight;
        
        setTimeout(() => {
          span.classList.add('fade');
        }, 50);
      });
    });

    replacementCount += totalReplacements;
    updateCounter();
  }

  processingQueue.delete(messageNode);
}

// Function to check if ChatGPT is still generating a response
function isGenerating() {
  return !!document.querySelector('button[aria-label="Stop generating"]') ||
         !!document.querySelector('button[aria-label="Continue generating"]');
}

// Function to process the latest message
function processLatestMessage() {
  if (isPaused) return;
  
  const messages = document.querySelectorAll('main div[data-message-author-role="assistant"]');
  const latestMessage = messages[messages.length - 1];
  
  if (latestMessage) {
    processCompleteMessage(latestMessage);
  }
}

// Create a fetch observer to monitor API calls
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0];
  const response = await originalFetch.apply(this, args);
  
  // Clone the response so we can still read it
  const clone = response.clone();
  
  // Check the URL to determine the state
  if (url.includes('/backend-api/conversation')) {
    isPaused = true;
    clearTimeout(unpauseTimeout);
  } else if (url.includes('/backend-api/lat/r')) {
    // Wait 1 second after the completion signal before unpausing
    clearTimeout(unpauseTimeout);
    unpauseTimeout = setTimeout(() => {
      isPaused = false;
      processLatestMessage(); // Process any pending replacements
    }, 1000);
  }
  
  return response;
};

// Function to handle mutations
function handleMutations(mutations) {
  if (!isPaused) {
    processLatestMessage();
  }
}

// Create a mutation observer to watch for changes in the chat
const observer = new MutationObserver(handleMutations);

// Start observing the chat container
function initializeObserver() {
  const chatContainer = document.querySelector('main');
  if (chatContainer) {
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Process existing messages
    const existingMessages = chatContainer.querySelectorAll('div[data-message-author-role="assistant"]');
    existingMessages.forEach(processCompleteMessage);
  } else {
    // If the chat container isn't found, retry after a short delay
    setTimeout(initializeObserver, 500);
  }
}

// Initialize the observer when the page loads
document.addEventListener('DOMContentLoaded', initializeObserver);

// Also run initialization immediately in case the DOM is already loaded
initializeObserver();

// Add a periodic check for new messages that might have been missed
setInterval(() => {
  if (!isPaused) {
    const messages = document.querySelectorAll('main div[data-message-author-role="assistant"]');
    messages.forEach(message => {
      if (!processingQueue.has(message)) {
        processCompleteMessage(message);
      }
    });
  }
}, 1000);