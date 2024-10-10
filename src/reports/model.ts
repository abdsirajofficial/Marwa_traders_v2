import { z } from "zod";

export const editInvoiceSchema = z.object({
    productName: z.string({ required_error: "productName is required" }).optional(),
    name: z.string({ required_error: "name is required" }).optional(),
    area: z.string({ required_error: "area is required" }).optional(),
    date: z.string({ required_error: "date is required" }).optional(),
    discount: z.number({ required_error: "discount is required" }).optional(),
    quantity: z.number({ required_error: "quantity is required" }).optional(),
    spl: z.number({ required_error: "spl is required" }).optional(),
    mrp: z.number({ required_error: "mrp is required" }).optional(),
});

export type editInvoiceData = z.infer<typeof editInvoiceSchema>