import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { validationResult } from 'express-validator';

const prisma = new PrismaClient();

export const billingRouter = express.Router();

//Routes
billingRouter.post("/addBill", addBill);
billingRouter.get("/getBill", getBillRequest);

//#region
//add bill 
async function addBill(req: Request, res: Response) {
  try {
    const state = req.body.State;
    const products = req.body.Products;

    if (!state || !products) {
      return res.json({
        error: "Missing params required",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'Products must be an array.' });
    }

    const lastInvoice = await prisma.reports.findFirst({
      orderBy: {
        invoiceNumber: 'desc',
      },
      select: {
        invoiceNumber: true,
      },
    });

    const currentInvoiceNumber = lastInvoice ? lastInvoice.invoiceNumber + 1 : 1;

    const errorMessages = [];
    let outOfStockOccurred = false;
    let productNotFoundOccurred = false;

    for (const product of products) {
      const existingProduct = await prisma.products.findFirst({
        where: {
          productName: product.productName,
        },
      });

      if (existingProduct) {
        const updatedQuantity = existingProduct.quantity - product.quantity;

        if (updatedQuantity < 0) {
          if (!outOfStockOccurred) {
            errorMessages.push('Some products are out of stock.');
            outOfStockOccurred = true;
          }
        } else {
          const mergedProduct = {
            ...state,
            productName: product.productName,
            quantity: product.quantity,
            mrp: product.mrp,
            discount: product.discount,
            netRate: product.netRate,
            add: product.add,
            saleRate: product.saleRate,
            category: product.category,
            invoiceNumber: currentInvoiceNumber,
          };

          await prisma.reports.create({
            data: mergedProduct,
          });

          await prisma.products.update({
            where: {
              id: existingProduct.id,
            },
            data: {
              quantity: updatedQuantity,
            },
          });
        }
      } else {
        if (!productNotFoundOccurred) {
          errorMessages.push('Some products were not found in the products. Skipped.');
          productNotFoundOccurred = true;
        }
      }
    }

    if (errorMessages.length === 0) {
      return res.json({
        success: 'Products updated and billed',
        invoiceNumber: currentInvoiceNumber,
      });
    } else {
      return res.status(400).json({
        errors: errorMessages,
        invoiceNumber: currentInvoiceNumber,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
//#endregion

//#region
//getBill Request
async function getBillRequest(req: Request, res: Response) {
    try {
        const question = req.query.question as string;

        if (!question) {
            return res.status(400).json({ error: 'Question parameter is required.' });
        }

        const products = await prisma.products.findMany({
            where: {
                productName: {
                    contains: question,
                },
            },
        });

        if (products.length === 0) {
            return res.status(404).json({ error: 'No matching products found.' });
        }

        return res.json({ success: products });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
//#endregion
