import { z } from "zod"

export const userSchema = z.object({
    email: z.string({required_error: "email is required", }),
    password: z.string({required_error: "password is required", }),
})

export type userData = z.infer<typeof userSchema>