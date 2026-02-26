export declare const auth: import("better-auth", { with: { "resolution-mode": "import" } }).Auth<{
    database: {
        dialect: string;
        type: string;
    };
    emailAndPassword: {
        enabled: true;
    };
}>;
