import { Sensei, IO } from "../src";
import { debug } from "../src/wrapper";

const main = async () => {
  const isDebugLog = false;

  const sensei = new Sensei();
  const io = new IO(isDebugLog);

  const baseDir = process.argv[2] ? process.argv[2] : ".";
  const targetDir = process.argv[3] ? process.argv[3] : baseDir;
  const pattern = process.argv[4] ? process.argv[4] : undefined;

  await io.storeDir(baseDir, targetDir, pattern);

  console.log(
    `読み込んだファイル: \n${io.codes
      .map((c) => {
        return c.filePath;
      })
      .join("\n")}`,
  );

  process.stdin.setEncoding("utf8");
  const reader = require("readline").createInterface({
    input: process.stdin,
  });

  sensei.isDebugLog = isDebugLog;

  sensei.addCodeContexts(io.codes);
  console.log(`\nデフォルトトークン数: ${sensei.getBaseNumTokens()}\n`);

  console.log(`質問:`);
  reader.on("line", async (line: string) => {
    const { answer, numTokens, reduceNumTokens } = await sensei.ask(line);
    console.log(`\n回答:\n${answer}\n`);
    if (isDebugLog) {
      debug(`現在のトークン数: ${numTokens}`);
      debug(`削減した過去の会話のトークン数: ${reduceNumTokens.size}`);
      debug(`削減した過去の会話の数: ${reduceNumTokens.num}`);
    }
    console.log("質問:");
  });
};

const main3 = async () => {
  const sensei = new Sensei();

  process.stdin.setEncoding("utf8");
  const reader = require("readline").createInterface({
    input: process.stdin,
  });

  console.log(`質問:`);
  reader.on("line", async (line: string) => {
    const answer = await sensei.askWithFineTuned(line);
    console.log(`\n回答:\n${answer}\n`);

    console.log("質問:");
  });
};

const main2 = async () => {
  const sensei = new Sensei();
  const io = new IO();

  for (const file of ["Code.ts", "index.ts", "IO.ts", "Sensei.ts"]) {
    await io.storeFile(`./src/${file}`);
  }

  await sensei.createFineTuneFile("./models/hoge.jsonl", io.codes);
  const sendFileResult = await sensei.sendFineTuneFile("./models/hoge.jsonl");
  console.log(JSON.stringify(sendFileResult));

  const createFineTuneResult = await sensei.createFineTune(sendFileResult.id);
  console.log(JSON.stringify(createFineTuneResult));
};

(async () => {
  await main();
})();
