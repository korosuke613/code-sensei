import fs from "node:fs/promises";
import path from "node:path";
import { Code } from "./Code";
import * as parseGitignore from "parse-gitignore";
import wildcardMatch from "wildcard-match";
import recursive from "recursive-readdir";
import { debug } from "./wrapper";

export class IO {
  get codes(): Code[] {
    return this._codes;
  }
  private readonly _codes: Code[];
  public readonly defaultIgnorePatterns = [
    ".git",
    ".idea",
    "package-lock.json",
  ];

  constructor(public isDebugLog = false) {
    this._codes = [];
  }

  private async getFilePathsWithoutGitignore(
    baseDir: string,
    dirPath: string,
    pattern: string,
    additionalIgnorePatterns: string[] = [],
  ) {
    const gitignoreFile = await fs.readFile(`${baseDir}/.gitignore`);
    const gitignore = parseGitignore.parse(gitignoreFile);
    const trailingSlashGitignore = gitignore.patterns.map((p) =>
      p.replace(/\/$/g, ""),
    );
    const ignoreMatch = wildcardMatch([
      ...trailingSlashGitignore,
      ...additionalIgnorePatterns,
      ...this.defaultIgnorePatterns,
    ]);

    const isMatch = wildcardMatch([pattern]);

    return await recursive(dirPath, [
      (file, stats) => {
        const pathFromBaseDir = file.replace(`${baseDir}/`, "");
        const fileName = path.basename(file);
        if (this.isDebugLog) {
          debug(
            JSON.stringify({
              pathFromBaseDir,
              fileName,
              match: stats.isFile() && !isMatch(fileName),
            }),
          );
        }
        return (
          (stats.isFile() && !isMatch(fileName)) ||
          ignoreMatch(pathFromBaseDir) ||
          pathFromBaseDir.startsWith(".")
        );
      },
    ]);
  }

  async storeDir(baseDir: string, dirPath: string, pattern: string = "*") {
    const filePaths = await this.getFilePathsWithoutGitignore(
      baseDir,
      dirPath,
      pattern,
    );
    for (const f of filePaths) {
      await this.storeFile(f);
    }
  }

  async storeFile(filePath: string) {
    const body = await fs.readFile(filePath, { encoding: "utf-8" });
    const fileName = path.basename(filePath);
    const fileDir = path.dirname(filePath);
    this._codes.push({
      fileName,
      fileDir,
      filePath,
      body,
    });
  }
}
