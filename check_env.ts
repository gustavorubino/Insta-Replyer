
console.log("--- ENV VAR CHECK ---");
console.log("INSTAGRAM_APP_ID:", process.env.INSTAGRAM_APP_ID ? "Set (length " + process.env.INSTAGRAM_APP_ID.length + ")" : "MISSING");
console.log("FACEBOOK_APP_ID:", process.env.FACEBOOK_APP_ID ? "Set (length " + process.env.FACEBOOK_APP_ID.length + ")" : "MISSING");
console.log("WEBHOOK_VERIFY_TOKEN:", process.env.WEBHOOK_VERIFY_TOKEN || "MISSING");
