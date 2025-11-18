import express from "express";
import { lottie2mp4 } from "./lottie2mp4.js";

const app = express();

app.get("/", async (_req, res) => {
	try {
		const video = await lottie2mp4();
		res.setHeader("Content-Type", "video/mp4");
		res.setHeader("Content-Disposition", 'attachment; filename="lottie.mp4"');
		res.send(video);
	} catch (error) {
		console.error(error);
		res.status(500).send("Failed to generate video");
	}
});

const server = app.listen(3000);

process.on("SIGINT", () => server.close());
