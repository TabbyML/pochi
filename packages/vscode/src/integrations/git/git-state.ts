import { getLogger } from "@getpochi/common";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { Deferred } from "../checkpoint/util";
import type { API, GitExtension, Repository } from "./git";

const logger = getLogger("GitStateMonitor");

export interface GitRepositoryState {
  rootUri: vscode.Uri;
  currentBranch: {
    name: string | undefined;
    commit: string | undefined;
  };
}

export interface GitStateChangeEvent {
  type: "branch-changed";
  repository: string;
  previousBranch?: string;
  currentBranch?: string;
}

export interface GitRepositoryChangeEvent {
  type: "repository-changed";
  repository: string;
  change: "added" | "removed";
}

/**
 * Monitors Git repository state using VS Code's Git extension API
 * Provides events for state changes (branch changes)
 */
@injectable()
@singleton()
export class GitStateMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repositoryDisposables = new Map<
    string,
    vscode.Disposable[]
  >();

  private gitExtension: GitExtension | undefined;
  private gitAPI: API | undefined;
  private repositoryState = new Map<string, GitRepositoryState>();

  get repositories(): Repository[] {
    return this.gitAPI?.repositories ?? [];
  }

  readonly #onDidChangeGitState =
    new vscode.EventEmitter<GitStateChangeEvent>();

  /**
   * Event fired when Git state changes (branch changes)
   */
  public readonly onDidChangeGitState: vscode.Event<GitStateChangeEvent> =
    this.#onDidChangeGitState.event;

  /**
   * Event fired when repository change, such as add or remove repositories and worktrees
   */
  readonly #onDidRepositoryChange =
    new vscode.EventEmitter<GitRepositoryChangeEvent>();
  public readonly onDidRepositoryChange: vscode.Event<GitRepositoryChangeEvent> =
    this.#onDidRepositoryChange.event;

  public isInitialized = new Deferred<void>();

  constructor() {
    this.disposables.push(this.#onDidChangeGitState);
    this.initialize();
  }

  /**
   * Initialize the Git state monitor
   */
  private async initialize(): Promise<void> {
    try {
      // Get VS Code's Git extension
      const git = vscode.extensions.getExtension<GitExtension>("vscode.git");

      if (!git) {
        logger.debug("VS Code Git extension not found");
        return;
      }

      if (!git.isActive) {
        await git.activate();
      }

      this.gitExtension = git.exports;

      if (!this.gitExtension) {
        logger.debug("Failed to get Git extension exports");
        return;
      }

      // Get the Git API
      this.gitAPI = this.gitExtension.getAPI(1);

      if (!this.gitAPI) {
        logger.debug("Failed to get Git API");
        return;
      }

      // Listen for repository open/close events
      this.disposables.push(
        this.gitAPI.onDidOpenRepository((repository) =>
          this.handleRepositoryOpened(repository),
        ),
      );

      this.disposables.push(
        this.gitAPI.onDidCloseRepository((repository) =>
          this.handleRepositoryClosed(repository),
        ),
      );

      await this.gitApiReady();
      // Initialize existing repositories
      for (const repository of this.gitAPI.repositories) {
        logger.debug(
          `Initializing existing repository: ${repository.rootUri.toString()}`,
        );
        await this.handleRepositoryOpened(repository);
      }

      this.isInitialized.resolve();

      logger.debug("Git state monitor initialized successfully");
    } catch (error) {
      logger.debug("Failed to initialize Git state monitor:", error);
    }
  }

  private async gitApiReady() {
    return new Promise<void>((resolve, reject) => {
      if (!this.gitAPI) {
        reject("VSCode git API is not available");
        return;
      }

      if (this.gitAPI.state === "initialized") {
        resolve();
        return;
      }
      this.disposables.push(
        this.gitAPI.onDidChangeState((state) => {
          if (state === "initialized") {
            resolve();
          }
        }),
      );
    });
  }

  private async handleRepositoryOpened(repository: Repository): Promise<void> {
    try {
      this.#onDidRepositoryChange.fire({
        type: "repository-changed",
        repository: repository.rootUri.fsPath,
        change: "added",
      });
      const repoKey = repository.rootUri.toString();
      logger.debug(`Repository opened: ${repoKey}`);

      // Set up state change listener for this repository
      const stateChangeDisposable = repository.state.onDidChange(() => {
        this.handleRepositoryStateChanged(repository);
      });

      // Store disposables for cleanup
      this.repositoryDisposables.set(repoKey, [stateChangeDisposable]);

      // Initialize repository state
      await this.handleRepositoryStateChanged(repository);
    } catch (error) {
      logger.debug("Failed to handle repository opened event:", error);
    }
  }

  private handleRepositoryClosed(repository: Repository): void {
    try {
      this.#onDidRepositoryChange.fire({
        type: "repository-changed",
        repository: repository.rootUri.fsPath,
        change: "removed",
      });
      const repoKey = repository.rootUri.toString();
      logger.debug(`Repository closed: ${repoKey}`);

      // Dispose of repository-specific disposables
      const disposables = this.repositoryDisposables.get(repoKey);
      if (disposables) {
        for (const disposable of disposables) {
          disposable.dispose();
        }
        this.repositoryDisposables.delete(repoKey);
      }

      // Remove repository state
      this.repositoryState.delete(repoKey);
    } catch (error) {
      logger.debug("Failed to handle repository closed event:", error);
    }
  }

  private async handleRepositoryStateChanged(
    repository: Repository,
  ): Promise<void> {
    try {
      const repoKey = repository.rootUri.toString();
      const previousState = this.repositoryState.get(repoKey);
      const currentState = this.buildRepositoryState(repository);

      this.repositoryState.set(repoKey, currentState);

      if (
        previousState &&
        previousState.currentBranch.name !== currentState.currentBranch.name
      ) {
        this.#onDidChangeGitState.fire({
          type: "branch-changed",
          repository: repository.rootUri.fsPath,
          previousBranch: previousState.currentBranch.name,
          currentBranch: currentState.currentBranch.name,
        });

        logger.debug(
          `Branch changed from '${previousState.currentBranch.name}' to '${currentState.currentBranch.name}' in ${repoKey}`,
        );
      }
    } catch (error) {
      logger.debug("Failed to handle repository state change:", error);
    }
  }

  private buildRepositoryState(repository: Repository): GitRepositoryState {
    const state = repository.state;

    // Get current branch info
    const head = state.HEAD;
    const currentBranch = {
      name: head?.name,
      commit: head?.commit,
    };

    return {
      rootUri: repository.rootUri,
      currentBranch,
    };
  }

  dispose(): void {
    for (const disposables of this.repositoryDisposables.values()) {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    }
    this.repositoryDisposables.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.repositoryState.clear();

    logger.debug("Git state monitor disposed");
  }
}
