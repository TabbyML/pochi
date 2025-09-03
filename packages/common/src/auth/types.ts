export abstract class AuthProvider {
  abstract authenticated: boolean;

  abstract getUser(): Promise<User | null>;

  abstract logout(): Promise<void>;
}

export type User = {
  name: string;
  email: string;
};
