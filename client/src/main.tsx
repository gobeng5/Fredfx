import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  // Log the error for debugging but prevent it from flooding the console
  const reason = event.reason;
  
  // Check if it's a fetch error (common in React Query failures)
  if (reason && typeof reason === 'object' && (reason.name === 'TypeError' || reason.message?.includes('fetch'))) {
    console.debug('Network request failed:', reason.message || reason);
  } else {
    console.error('Unhandled promise rejection:', reason);
  }
  
  // Prevent the default browser error reporting
  event.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
