import React from "react";
import { createRoot } from "react-dom/client";
import Gate from "./Gate.jsx";
import { installClientClock } from "./clientClock.js";
installClientClock();
createRoot(document.getElementById("root")).render(<Gate />);
