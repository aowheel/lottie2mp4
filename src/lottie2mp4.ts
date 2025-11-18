import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import puppeteer from "puppeteer";

declare global {
	interface Window {
		loadLottie: (data: unknown) => Promise<void>;
		getTotalFrames: () => number;
		goToFrame: (frame: number) => void;
	}
}

export async function lottie2mp4(): Promise<Buffer> {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lottie-frames-"));
	const framesDir = path.join(tmpDir, "frames");
	await fs.mkdir(framesDir);

	try {
		const browser = await puppeteer.launch({
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});

		try {
			const page = await browser.newPage();
			await page.setViewport({ width: 1080, height: 1920 });

			const rendererUrl = new URL("renderer.html", import.meta.url).href;
			await page.goto(rendererUrl);

			const jsonPath = fileURLToPath(new URL("lottie.json", import.meta.url));
			const lottieData = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
			await page.evaluate(
				async (data) => await window.loadLottie(data),
				lottieData,
			);

			const totalFrames = await page.evaluate(() => window.getTotalFrames());

			for (let i = 0; i < totalFrames; i++) {
				await page.evaluate((frame) => {
					window.goToFrame(frame);
				}, i);

				const framePath = path.join(
					framesDir,
					`frame_${String(i).padStart(5, "0")}.png`,
				);

				await page.screenshot({ path: framePath as `${string}.png` });
			}

			const outputPath = path.join(tmpDir, "output.mp4");
			const args = [
				"-y",
				"-framerate",
				"60",
				"-i",
				path.join(framesDir, "frame_%05d.png"),
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				outputPath,
			];

			await new Promise<void>((resolve, reject) => {
				const proc = spawn(ffmpegPath as unknown as string, args);
				proc.on("error", reject);
				proc.on("close", (code) => {
					if (code === 0) resolve();
					else reject(new Error(`FFmpeg exited with code ${code}`));
				});
			});

			return await fs.readFile(outputPath);
		} finally {
			await browser.close();
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
}
