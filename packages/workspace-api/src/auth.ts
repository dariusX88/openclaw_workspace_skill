import type { FastifyRequest } from "fastify";

export function assertServiceAuth(req: FastifyRequest, serviceToken: string) {
  const auth = req.headers["authorization"];
  const expected = `Bearer ${serviceToken}`;
  if (!auth || auth !== expected) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}
