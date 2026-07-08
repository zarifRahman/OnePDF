import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker is copied to /public by the postinstall script so it is served
// locally (offline, no CDN). Version must match the copied worker.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
