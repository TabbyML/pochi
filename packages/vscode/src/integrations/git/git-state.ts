import { Deferred } from "@/lib/defered";
import { getLogger } from "@getpochi/common";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import type { API, GitExtension, Repository } from "./git";

const logger = getLogger("GitStateMonitor");

export interface GitRepository {
  rootUri: vscode.Uri;
  currentBranch: {
    name: string | undefined;
    commit: string | undefined;
  };
}

export interface GitBranchChangeEvent {
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
export class GitState implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repositoryDisposables = new Map<
    string,
    vscode.Disposable[]
  >();

  private git: API | undefined;
  private gitExtension: GitExtension | undefined;
  private gitRepositories = new Map<string, GitRepository>();

  // repo list with same order as vscode git extension
  get repositories(): string[] {
    return Array.from(this.gitRepositories.keys());
  }

  readonly #onDidChangeBranch = new vscode.EventEmitter<GitBranchChangeEvent>();

  /**
   * Event fired when Git state changes (branch changes)
   */
  readonly onDidChangeBranch: vscode.Event<GitBranchChangeEvent> =
    this.#onDidChangeBranch.event;

  /**
   * Event fired when repository change, such as add or remove repositories and worktrees
   */
  readonly #onDidChangeRepository =
    new vscode.EventEmitter<GitRepositoryChangeEvent>();
  readonly onDidChangeRepository: vscode.Event<GitRepositoryChangeEvent> =
    this.#onDidChangeRepository.event;

  inited = new Deferred<void>();

  constructor() {
    this.disposables.push(this.#onDidChangeBranch);
    this.initialize();
  }

  getRepository(path: string) {
    return this.git?.repositories.find((repo) => repo.rootUri.fsPath === path);
  }

  async getBranches(path: string) {
    const repo = this.getRepository(path);
    if (!repo) {
      return [];
    }
    const branches = (
      await repo.getBranches({ remote: true, sort: "committerdate" })
    )
      .filter((ref) => ref.type === 0 || ref.type === 1) // Head or RemoteHead
      .map((ref) => ref.name)
      .filter((name): name is string => !!name);

    return branches;
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
      this.git = this.gitExtension.getAPI(1);

      if (!this.git) {
        logger.debug("Failed to get Git API");
        return;
      }
      await this.gitApiReady();

      // Listen for repository open/close events
      this.disposables.push(
        this.git.onDidOpenRepository((repository) =>
          this.handleRepositoryOpened(repository),
        ),
      );

      this.disposables.push(
        this.git.onDidCloseRepository((repository) =>
          this.handleRepositoryClosed(repository),
        ),
      );

      // Initialize existing repositories
      for (const repository of this.git.repositories) {
        logger.debug(
          `Initializing existing repository: ${repository.rootUri.toString()}`,
        );
        await this.handleRepositoryOpened(repository);
      }

      this.inited.resolve();

      logger.debug("Git state monitor initialized successfully");
    } catch (error) {
      logger.debug("Failed to initialize Git state monitor:", error);
    }
  }

  private async gitApiReady() {
    return new Promise<void>((resolve, reject) => {
      if (!this.git) {
        reject("VSCode git API is not available");
        return;
      }

      if (this.git.state === "initialized") {
        resolve();
        return;
      }
      this.disposables.push(
        this.git.onDidChangeState((state) => {
          if (state === "initialized") {
            resolve();
          }
        }),
      );
    });
  }

  private async handleRepositoryOpened(repository: Repository): Promise<void> {
    try {
      this.#onDidChangeRepository.fire({
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
      this.#onDidChangeRepository.fire({
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
      this.gitRepositories.delete(repoKey);
    } catch (error) {
      logger.debug("Failed to handle repository closed event:", error);
    }
  }

  private async handleRepositoryStateChanged(
    repository: Repository,
  ): Promise<void> {
    try {
      const repoKey = repository.rootUri.toString();
      const previousState = this.gitRepositories.get(repoKey);
      const currentState = this.buildRepositoryState(repository);

      this.gitRepositories.set(repoKey, currentState);

      if (
        previousState &&
        previousState.currentBranch.name !== currentState.currentBranch.name
      ) {
        this.#onDidChangeBranch.fire({
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

  private buildRepositoryState(repository: Repository): GitRepository {
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
    this.gitRepositories.clear();

    logger.debug("Git state monitor disposed");
  }
}
