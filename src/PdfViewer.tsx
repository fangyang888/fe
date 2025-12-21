import React from "react";

interface PdfViewerProps {
  url: string;
  height?: number | string;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ url, height = "80vh" }) => {
  return (
    <iframe
      src={url}
      title="PDF Viewer"
      style={{
        width: "100%",
        height,
        border: "none",
        background: "#fff",
      }}
    />
  );
};

export default PdfViewer;
