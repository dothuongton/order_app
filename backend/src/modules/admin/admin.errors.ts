export class AdminApiError extends Error {
    public status: number;

    constructor(
        public statusCode: number,
        public errorCode: string,
        message: string,
        public details?: any
    ) {
        super(message);
        this.status = statusCode;
        this.name = 'AdminApiError';
        Object.setPrototypeOf(this, AdminApiError.prototype);
    }
}
