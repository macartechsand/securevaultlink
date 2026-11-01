/**
 * Offscreen document used only to clear the clipboard 30 s after a copy (service workers have no
 * clipboard access). It never reads the clipboard, so no clipboardRead permission is needed.
 */
chrome.runtime.onMessage.addListener((message: { target?: string; type?: string }, sender) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen' || message.type !== 'clear-clipboard') return false;
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData('text/plain', '');
  };
  document.addEventListener('copy', onCopy, { once: true });
  document.execCommand('copy');
  return false;
});
