import { getLogger } from "@getpochi/common";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
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
  private repositories = new Map<string, GitRepositoryState>();

  readonly #onDidChangeGitState =
    new vscode.EventEmitter<GitStateChangeEvent>();

  /**
   * Event fired when Git state changes (branch changes)
   */
  public readonly onDidChangeGitState: vscode.Event<GitStateChangeEvent> =
    this.#onDidChangeGitState.event;

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

      // Initialize existing repositories
      for (const repository of this.gitAPI.repositories) {
        await this.handleRepositoryOpened(repository);
      }

      logger.debug("Git state monitor initialized successfully");
    } catch (error) {
      logger.debug("Failed to initialize Git state monitor:", error);
    }
  }

  private async handleRepositoryOpened(repository: Repository): Promise<void> {
    try {
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
      this.repositories.delete(repoKey);
    } catch (error) {
      logger.debug("Failed to handle repository closed event:", error);
    }
  }

  private async handleRepositoryStateChanged(
    repository: Repository,
  ): Promise<void> {
    try {
      const repoKey = repository.rootUri.toString();
      const previousState = this.repositories.get(repoKey);
      const currentState = this.buildRepositoryState(repository);

      this.repositories.set(repoKey, currentState);

      if (
        previousState &&
        previousState.currentBranch.name !== currentState.currentBranch.name
      ) {
        this.#onDidChangeGitState.fire({
          type: "branch-changed",
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
    this.repositories.clear();

    logger.debug("Git state monitor disposed");
  }
}
