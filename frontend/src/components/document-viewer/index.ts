/**
 * Document Viewer Components
 * Export all viewer-related components
 * 
 * Note: PDFViewer should be dynamically imported with ssr: false
 * due to react-pdf using browser APIs. Use:
 *   const PDFViewer = dynamic(() => import("./PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
 */

// PDFViewer intentionally not exported here - use dynamic import
export { DOCXViewer } from "./DOCXViewer";
export { TXTViewer } from "./TXTViewer";
export { DocumentSearchBar } from "./DocumentSearchBar";
export { ViewerModeToggle, type ViewerMode } from "./ViewerModeToggle";
export { DocumentViewerPanel } from "./DocumentViewerPanel";
