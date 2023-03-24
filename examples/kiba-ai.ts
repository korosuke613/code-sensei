import { Sensei } from "../src";
import { debug } from "../src/wrapper";
import { parse } from "yaml";
import fs from "node:fs/promises";
const main = async () => {
  const isDebugLog = process.argv[2] ? Boolean(process.argv[2]) : false;

  const kibaFile = await fs.readFile("./examples/kiba-legend.yaml", "utf-8");
  const kibaLegends = parse(kibaFile) as [
    {
      date: string;
      star: number;
      title: string;
      legend: string;
      description: string;
    },
  ];

  const sensei = new Sensei();

  const responseWord = "解説";
  sensei.isDebugLog = isDebugLog;
  sensei.firstContent = [
    {
      role: "system",
      content:
        "あなたはユーモアあふれる憎めないキャラクター「きばちゃん」です。",
    },
    {
      role: "system",
      content:
        "きばちゃんが使う独特の用語を教えます。`用語: 意味`という形式です。積極的に使ってください",
    },
    {
      role: "system",
      content: [
        "ベーター: エレベーター",
        "シマヤ: 高島屋",
        "バシ: 日本橋、あるいはその他の橋",
        "ヤシブ: 渋谷",
        "ノガミ: 上野",
        "ブクロ: 池袋",
        "ナワ: 沖縄",
      ].join("\n"),
    },
    {
      role: "system",
      content: "きばちゃんは自分のことを「僕」と呼びます。",
    },
    {
      role: "system",
      content: `きばちゃんには伝説があります。伝説に対してきばちゃんは${responseWord}します。これから伝説と${responseWord}の例を教えます。ユーザからは伝説が渡されるので、きばちゃんになったつもりで伝説を${responseWord}してください。`,
    },
  ];
  sensei.chatContexts = kibaLegends
    .filter((k) => k.star > 1)
    .sort((a, b) => {
      // star順にする
      return a.star > b.star ? -1 : 1;
    })
    .map((k, index) => {
      return {
        role: "system",
        // content: `【伝説${index}】:\n${k.legend}\n\n【解説${index}:\nきばちゃん「\n${k.description}\n」`,
        // content: `【伝説${index}】:\n${k.legend}\n\nきばちゃん: \n${k.description}`,
        // content: `【伝説${index}】:\n${k.legend}\n\nきばちゃん「\n${k.description}\n」`,
        content: `【伝説（例${index}）】:\n${k.legend}\n\n【きばちゃんによる${responseWord}（例${index}）】「\n${k.description}\n」`,
      };
    });

  while (sensei.getBaseNumTokens() > 3400) {
    sensei.chatContexts.pop();
  }

  if (isDebugLog) {
    debug(`読み込んだ伝説の数: ${sensei.chatContexts.length}`);
    debug(`デフォルトトークン数: ${sensei.getBaseNumTokens()}`);
  }

  process.stdin.setEncoding("utf8");
  const reader = require("readline").createInterface({
    input: process.stdin,
  });

  // console.log(JSON.stringify(sensei.chatContexts, null, 2));

  const userLabel = "【伝説あるいは質問】:";
  console.log(userLabel);
  let lines: string[] = [];
  reader.on("line", async (line: string) => {
    lines.push(line);
    if (line === "\n" || line === "\r\n" || line.length < 2) {
      console.log("\nAIきばちゃん:");

      const options = {
        temperature: 0.8,
        presence_penalty: 0.8,
      };

      if (isDebugLog) {
        debug(`${JSON.stringify(options)}`);
      }
      const { answer, numTokens, reduceNumTokens } = await sensei.ask(
        `${userLabel} \n${lines.join("\n")}`,
        options,
      );
      console.log(`${answer}\n`);
      if (isDebugLog) {
        debug(`現在のトークン数: ${numTokens}`);
        debug(`削減した過去の会話のトークン数: ${reduceNumTokens.size}`);
        debug(`削減した過去の会話の数: ${reduceNumTokens.num}`);
      }
      lines = [];
      console.log(userLabel);
    }
  });
};

(async () => {
  await main();
})();
