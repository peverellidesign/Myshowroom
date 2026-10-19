export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Non hai i permessi per eseguire questa operazione.") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Elemento non trovato.") {
    super(message, 404);
  }
}
