import { isAxiosError } from "axios";

export const execOpenAIAPI = async <T>(callback: () => T): Promise<T> => {
  try {
    return callback();
  } catch (error) {
    if (isAxiosError(error)) {
      // Consider adjusting the error handling logic for your use case
      if (error.response) {
        throw new Error(
          `Status: ${error.response.status}, Data: ${JSON.stringify(
            error.response.data,
            null,
            2,
          )}`,
        );
      } else {
        throw new Error(`Error with OpenAI API request: ${error.message}`);
      }
    }
    console.error("Unknown error");
    throw error;
  }
};

export const debug = (message: string) => {
  console.debug(`[debug]: ${message}`);
};
