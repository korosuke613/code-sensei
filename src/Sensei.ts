import { Configuration, CreateChatCompletionRequest, OpenAIApi } from "openai";
import { Code } from "./Code";
import { ChatCompletionRequestMessage } from "openai/api";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { debug, execOpenAIAPI } from "./wrapper";
import { encoding_for_model, TiktokenModel } from "@dqbd/tiktoken";

const MAX_TOKENS_FOR_GPT_3_5_TURBO = 4096;

const defaultCreateChatCompletionRequest: Partial<CreateChatCompletionRequest> =
  {
    model: "gpt-3.5-turbo",
    temperature: 0.6,
  };

export class Sensei {
  private openai: OpenAIApi;
  private prevMessages: ChatCompletionRequestMessage[] = [];
  private baseCreateChatCompletionRequest = defaultCreateChatCompletionRequest;
  public firstContent: ChatCompletionRequestMessage[] = [
    {
      role: "system",
      content:
        "あなたはプログラミングの先生です。ユーザからコードに関する質問がくるので答えてください。あなたの知っているコードは次です。",
    },
  ];
  public isDebugLog = false;

  // The number of tokens to allow room for not exceeding the maximum number of tokens.
  public maxNumTokensBuffer = 400;
  public chatContexts: ChatCompletionRequestMessage[] = [];

  constructor(openai?: OpenAIApi) {
    if (openai === undefined) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey === undefined) {
        throw new Error("OpenAI API Key is undefined");
      }

      const configuration = new Configuration({
        apiKey: apiKey,
      });
      this.openai = new OpenAIApi(configuration);
    } else {
      this.openai = openai;
    }
  }

  async createFineTuneFile(filePath: string, codes: Code[]) {
    const inputs: string[] = [];
    for (const code of codes) {
      const completion = code.body
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\//g, "\\/")
        .replace(/\b/g, "\\b")
        .replace(/\f/g, "\\f")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");

      const input = `{"prompt": "ファイル名 ${code.filePath} の中身は？", "completion": "${completion}"}`;
      inputs.push(input);
    }
    await fs.writeFile(filePath, inputs.join("\n"));
  }

  async sendFineTuneFile(filePath: string) {
    return execOpenAIAPI(async () => {
      const response = await this.openai.createFile(
        // @ts-ignore
        createReadStream(filePath),
        "fine-tune",
      );
      return response.data;
    });
  }

  async createFineTune(id: string) {
    return execOpenAIAPI(async () => {
      const response = await this.openai.createFineTune({
        model: "davinci",
        training_file: id,
      });
      return response.data;
    });
  }

  async getFineTune(id: string) {
    return execOpenAIAPI(async () => {
      const response = await this.openai.retrieveFineTune(id);
      return response.data;
    });
  }

  async askWithFineTuned(question: string) {
    return execOpenAIAPI(async () => {
      const response = await this.openai.createChatCompletion({
        ...(<CreateChatCompletionRequest>this.baseCreateChatCompletionRequest),
        model: "curie:ft-korosuke613-2023-03-21-15-38-43",
        messages: [
          {
            role: "system",
            content:
              "あなたはプログラミングの先生です。ユーザからコードに関する質問がくるので答えてください。",
          },
          ...this.prevMessages,
          { role: "user", content: question },
        ],
      });
      this.prevMessages.push({ role: "user", content: question });
      this.prevMessages.push(response.data.choices[0].message!);
      return response.data.choices[0].message?.content;
    });
  }

  countTokens(messages: ChatCompletionRequestMessage[]) {
    const enc = encoding_for_model(
      this.baseCreateChatCompletionRequest.model as TiktokenModel,
    );

    let numTokens = 0;
    messages.forEach((m) => {
      numTokens += enc.encode(m.content).length;
    });
    enc.free();

    return numTokens;
  }

  private createUserMessage(question: string): ChatCompletionRequestMessage {
    return { role: "user", content: question };
  }

  createChatCompletionRequestMessages(
    question: ChatCompletionRequestMessage,
    contexts: ChatCompletionRequestMessage[],
    prevMessages: ChatCompletionRequestMessage[],
  ): ChatCompletionRequestMessage[] {
    return [...this.firstContent, ...contexts, ...prevMessages, question];
  }

  reduceTokens(
    config: {
      contexts?: ChatCompletionRequestMessage[];
      additionalMessages?: ChatCompletionRequestMessage[];
    } = {},
  ) {
    if (config.contexts === undefined) config.contexts = [];
    if (config.additionalMessages === undefined) config.additionalMessages = [];

    const baseNumTokens = this.countTokens([
      ...this.firstContent,
      ...config.contexts,
    ]);
    const prevNumTokens = this.countTokens(this.prevMessages);
    const additionalMessagesNumToken = this.countTokens(
      config.additionalMessages,
    );
    const totalNumTokens =
      baseNumTokens + prevNumTokens + additionalMessagesNumToken;
    const prevMessageNums = this.prevMessages.length;

    if (
      totalNumTokens >
      MAX_TOKENS_FOR_GPT_3_5_TURBO - this.maxNumTokensBuffer
    ) {
      if (this.prevMessages.length === 0) {
        throw new Error(
          "No past conversations that can be erased. Please reduce the number of files to be loaded.",
        );
      }

      this.prevMessages.shift();
      this.reduceTokens(config);
    }

    const reduceInfo = {
      num: prevMessageNums - this.prevMessages.length,
      size: prevNumTokens - this.countTokens(this.prevMessages),
    };

    if (this.isDebugLog) {
      debug(
        JSON.stringify({
          baseNumTokens,
          prevNumTokens,
          additionalMessagesNumToken,
          totalNumTokens,
          prevMessageNums,
          reduceInfo,
        }),
      );
    }

    return reduceInfo;
  }

  addCodeContexts(codes: Code[]) {
    this.chatContexts = codes.map((c): ChatCompletionRequestMessage => {
      return {
        role: "system",
        content: `ファイル名: ${c.filePath}, Code: ${c.body}`,
      };
    });
  }

  getBaseNumTokens() {
    return this.countTokens([...this.firstContent, ...this.chatContexts]);
  }

  async ask(
    question: string,
    options: Partial<CreateChatCompletionRequest> = {},
  ) {
    const questionMessage = this.createUserMessage(question);

    const reduceNumTokens = this.reduceTokens({
      contexts: this.chatContexts,
      additionalMessages: [questionMessage],
    });

    const messages = this.createChatCompletionRequestMessages(
      questionMessage,
      this.chatContexts,
      this.prevMessages,
    );

    // if (this.isDebugLog) {
    //   debug(JSON.stringify(this.prevMessages, null, 2));
    // }

    const answer = await execOpenAIAPI(async () => {
      const response = await this.openai.createChatCompletion({
        ...(<CreateChatCompletionRequest>this.baseCreateChatCompletionRequest),
        ...options,
        messages,
      });
      return response.data.choices[0].message;
    });
    if (answer === undefined) {
      throw new Error("answer is undefined");
    }

    this.prevMessages.push({ role: "user", content: question });
    this.prevMessages.push(answer);

    messages.push(answer);

    const numTokens = this.countTokens(messages);

    return {
      numTokens,
      reduceNumTokens: reduceNumTokens,
      answer: answer.content,
    };
  }
}
