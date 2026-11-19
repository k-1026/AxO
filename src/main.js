import "./styles.css";
import "./auth/auth.css";
import { loadAppData } from "./data/repository.js";
import { startApp } from "./app.js";
import { initAuth } from "./auth/auth.js";

initAuth();
loadAppData().then(startApp);
