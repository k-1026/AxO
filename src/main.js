import "./styles.css";
import { loadAppData } from "./data/repository.js";
import { startApp } from "./app.js";

loadAppData().then(startApp);
