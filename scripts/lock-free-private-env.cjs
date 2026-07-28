const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
let e = fs.readFileSync(envPath, "utf8");
const set = (key, val) => {
  const line = `${key}="${val}"`;
  if (new RegExp(`^${key}=`, "m").test(e)) {
    e = e.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    e += `\n${line}\n`;
  }
};

set("ALLOW_DEFAULT_USER", "false");
set("DRIP_DRY_RUN", "true");
e = e.replace(/^WORKSPACE_ACCESS_CODE=.*$/gm, "");

fs.writeFileSync(envPath, e.trim() + "\n");
console.log(
  JSON.stringify({
    ALLOW_DEFAULT_USER: "false",
    DRIP_DRY_RUN: "true",
    note: "Access codes removed — use /login password or Google OAuth",
  })
);
