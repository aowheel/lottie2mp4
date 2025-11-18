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
	const startedAt = Date.now();
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lottie-frames-"));
	const framesDir = path.join(tmpDir, "frames");
	await fs.mkdir(framesDir);

	try {
		const browserLaunchStart = Date.now();
		const browser = await puppeteer.launch({
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
		console.log(
			`[lottie2mp4] browser launch: ${Date.now() - browserLaunchStart}ms`,
		);

		try {
			const setupStart = Date.now();
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
			console.log(
				`[lottie2mp4] renderer setup + lottie load: ${Date.now() - setupStart}ms (frames=${totalFrames})`,
			);

			const renderStart = Date.now();
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
			console.log(
				`[lottie2mp4] frame capture: ${Date.now() - renderStart}ms (frames=${totalFrames})`,
			);

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

			const ffmpegStart = Date.now();
			await new Promise<void>((resolve, reject) => {
				const proc = spawn(ffmpegPath as unknown as string, args);
				proc.on("error", reject);
				proc.on("close", (code) => {
					if (code === 0) resolve();
					else reject(new Error(`FFmpeg exited with code ${code}`));
				});
			});
			console.log(`[lottie2mp4] ffmpeg encode: ${Date.now() - ffmpegStart}ms`);

			return await fs.readFile(outputPath);
		} finally {
			await browser.close();
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
		console.log(
			`[lottie2mp4] total: ${Date.now() - startedAt}ms (temp cleaned)`,
		);
	}
}
