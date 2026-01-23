
import { createRoot } from "react-dom/client";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
// @ts-ignore
import App from "./App.jsx";
// @ts-ignore
import App2 from "./App2.jsx";
// @ts-ignore
import NumberDigitPredictor from "./NumberDigitPredictor.jsx";
// @ts-ignore
import Crawler from "./Crawler.jsx";

createRoot(document.getElementById("root")!).render(
  <App />
    // <BrowserRouter>
    //   <Routes>
    //     <Route path="/" element={<App />} />
    //     <Route path="/crawler" element={<Crawler />} />
    //   </Routes>
    // </BrowserRouter>,
);
