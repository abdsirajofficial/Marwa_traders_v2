import { z } from "zod"

export const productSchema = z.object({
    productName: z.string({required_error: "productName is required", }),
    quantity: z.number({required_error: "quantity is required", }),
    mrp: z.number({required_error: "mrp is required", }),
    discount: z.number({required_error: "discount is required", }),
    addMargin: z.number({required_error: "addMargin is required", }),
    netRate: z.number({required_error: "netRate is required", }),
    category: z.string({required_error: "category is required", })
})

export const editProductSchema = z.object({
    productName: z.string({required_error: "productName is required", }).optional(),
    quantity: z.number({required_error: "quantity is required", }).optional(),
    mrp: z.number({required_error: "mrp is required", }).optional(),
    discount: z.number({required_error: "discount is required", }).optional(),
    addMargin: z.number({required_error: "addMargin is required", }).optional(),
    netRate: z.number({required_error: "netRate is required", }).optional(),
    category: z.string({required_error: "category is required", }).optional()
})

export type productData = z.infer<typeof productSchema>
export type editProductData = z.infer<typeof editProductSchema>