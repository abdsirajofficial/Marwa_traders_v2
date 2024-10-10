import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { editInvoiceData, editInvoiceSchema } from "./model";
import { fromZodError } from "zod-validation-error";

const prisma = new PrismaClient();

export const reportRouter = express.Router();

//route
reportRouter.get("/", getReport);
reportRouter.get("/by", getReportsBy);
reportRouter.get("/products", getProductsReports);
reportRouter.get("/byName", getByName);
reportRouter.get("/pdf", getPdf);
reportRouter.put("/edit", editInvoice);
reportRouter.delete("/delete", deleteInvoice);
reportRouter.put("/invoiceDetails", updateInvoiceDetails);
reportRouter.get("/getInvoiceDetails", getInvoiceDetails);
reportRouter.delete("/deleteProduct", deleteProductInInvoice);
reportRouter.get("/availableProducts", getAvailableProducts);

interface ProductItem {
  productName: string;
  quantity: number;
}

async function editInvoice(req: Request, res: Response) {
  try {
    const { invoiceNumber, reportId, addQuantity = 0, minusQuantity = 0 } = req.query;
    const { products, ...updatedData } = req.body;

    // Ensure products is typed as an array of ProductItem
    const productsTyped: ProductItem[] = products || [];

    // Ensure invoiceNumber is a number
    const invoiceNumberInt = parseInt(invoiceNumber as string, 10);
    if (isNaN(invoiceNumberInt)) {
      return res.status(400).json({
        error: "Invalid invoice number.",
      });
    }

    const data = editInvoiceSchema.safeParse(updatedData);

    if (!data.success) {
      const errMessage = fromZodError(data.error).message;
      return res.status(400).json({
        error: {
          message: errMessage,
        },
      });
    }

    let updatedReport: any = null;
    let existingReport: any = null;

    // If reportId is provided, fetch existing report
    if (reportId) {
      const reportIdInt = parseInt(reportId as string, 10);
      if (isNaN(reportIdInt)) {
        return res.status(400).json({
          error: "Invalid report ID.",
        });
      }

      existingReport = await prisma.reports.findFirst({
        where: {
          id: reportIdInt,
          invoiceNumber: invoiceNumberInt,
        },
      });

      if (!existingReport) {
        return res.status(404).json({
          error: "Report not found for the given invoice number and report ID.",
        });
      }

      // Handle product quantity changes for the existing report
      const product = await prisma.products.findFirst({
        where: {
          productName: existingReport.productName,
        },
      });

      if (!product) {
        return res.status(404).json({
          error: "Product not found.",
        });
      }

      // Calculate quantity changes
      const addQty = parseInt(addQuantity as string, 10) || 0;
      const minusQty = parseInt(minusQuantity as string, 10) || 0;

      const quantityChange = addQty - minusQty;
      let newQuantity = existingReport.quantity + quantityChange;

      if (newQuantity < 1) {
        return res.status(400).json({
          error: "Cannot reduce quantity below 1. At least 1 item must remain in the report.",
        });
      }

      if (addQty > 0) {
        if (product.quantity < addQty) {
          return res.status(400).json({
            error: `Not enough stock available. Only ${product.quantity} items in stock.`,
          });
        }
      }

      // Update product quantity based on the changes
      const productNewQuantity = product.quantity - quantityChange;

      if (productNewQuantity < 0) {
        return res.status(400).json({
          error: "Not enough stock available to fulfill the request.",
        });
      }

      // Update product quantity
      await prisma.products.update({
        where: { id: product.id },
        data: {
          quantity: productNewQuantity,
        },
      });

      // Update invoice report with new quantity and other details
      const updateFields: Record<string, any> = {
        ...data.data,
        quantity: newQuantity,
      };

      updatedReport = await prisma.reports.update({
        where: {
          id: reportIdInt,
        },
        data: updateFields,
      });
    }else{
      existingReport = await prisma.reports.findFirst({
        where: {
          invoiceNumber: invoiceNumberInt,
        },
      });

      if (!existingReport) {
        return res.status(404).json({
          error: "Report not found for the given invoice number and report ID.",
        });
      }
    }

    // Add new products to the report
    if (productsTyped.length > 0) {
      const errors: string[] = [];

      const productUpdates = productsTyped.map(async (productItem: ProductItem) => {
        const productToAdd = await prisma.products.findFirst({
          where: {
            productName: productItem.productName,
          },
        });

        if (!productToAdd) {
          errors.push(`Product ${productItem.productName} not found.`);
          return;
        }

        const productAlreadyAdded = await prisma.reports.findFirst({
          where: {
            invoiceNumber: invoiceNumberInt,
            productName: productItem.productName,
          },
        });

        if (productAlreadyAdded) {
          errors.push(`Product ${productItem.productName} is already added to the invoice.`);
          return;
        }

        if (productToAdd.quantity < (productItem.quantity || 0)) {
          errors.push(`Not enough stock for ${productItem.productName}. Only ${productToAdd.quantity} items available.`);
          return;
        }

        await prisma.products.update({
          where: { id: productToAdd.id },
          data: {
            quantity: productToAdd.quantity - (productItem.quantity || 0),
          },
        });

        console.log(existingReport)

        // Create new report with updated fields
        const newReport = await prisma.reports.create({
          data: {
            invoiceNumber: invoiceNumberInt,
            productName: productToAdd.productName,
            quantity: productItem.quantity || 1,
            // Use updatedData or fallback to existing report values
            paymentMethod: updatedData.paymentMethod || (existingReport?.paymentMethod ?? "CASH"),
            name: updatedData.name || (existingReport?.name ?? ""),
            area: updatedData.area || (existingReport?.area ?? ""),
            date: updatedData.date || (existingReport?.date ?? new Date()),
            spl: updatedData.spl || (existingReport?.spl ?? 0),
            discount: updatedData.discount || (existingReport?.discount ?? 0),
            mrp: productToAdd.mrp,
            gst: existingReport?.gst ?? 18,
            netRate: productToAdd.netRate,
            category: productToAdd.category,
          },
        });

        return newReport;
      });

      const newReports = await Promise.all(productUpdates);

      if (errors.length > 0) {
        return res.status(400).json({
          error: errors.join(", "),
        });
      }

      updatedReport = newReports.filter(Boolean);
    }

    return res.json({
      success: "Invoice updated successfully.",
      updatedReport,
    });
  } catch (error) {
    console.error("Error updating invoice:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

// Function to get all products excluding those in the specified invoice and matching the search text
async function getAvailableProducts(req: Request, res: Response) {
  try {
    const invoiceNumber = parseInt(req.query.invoiceNumber as string);
    const searchText = req.query.searchText as string || ""; // Get search text from query

    if (isNaN(invoiceNumber)) {
      return res.status(400).json({
        error: "Invalid invoice number.",
      });
    }

    // Get all products in the specified invoice
    const existingProducts = await prisma.reports.findMany({
      where: { invoiceNumber: invoiceNumber },
      select: { productName: true },
    });

    const existingProductNames = existingProducts.map(p => p.productName);

    // Get all products excluding those already in the invoice
    const availableProducts = await prisma.products.findMany({
      where: {
        NOT: {
          productName: {
            in: existingProductNames,
          },
        },
        productName: {
          contains: searchText.toLowerCase(), // Convert search text to lowercase
        },
      },
    });

    // Filter the results to ensure case-insensitive matching
    const filteredProducts = availableProducts.filter(product =>
      product.productName.toLowerCase().includes(searchText.toLowerCase())
    );

    return res.json({
      success: filteredProducts, // Return all fields of the filtered products
    });
  } catch (error) {
    console.error("Error fetching available products:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

// Function to delete a product in an invoice
async function deleteProductInInvoice(req: Request, res: Response) {
  try {
    const { invoiceNumber, reportId } = req.query;

    if (!invoiceNumber || !reportId) {
      return res.status(400).json({
        error: "Invoice number and report ID are required.",
      });
    }

    const invoiceNumberInt = parseInt(invoiceNumber as string, 10);
    const reportIdInt = parseInt(reportId as string, 10);

    if (isNaN(invoiceNumberInt) || isNaN(reportIdInt)) {
      return res.status(400).json({
        error: "Invalid invoice number or report ID.",
      });
    }

    // Find the report to delete
    const report = await prisma.reports.findFirst({
      where: {
        id: reportIdInt,
        invoiceNumber: invoiceNumberInt,
      },
    });

    if (!report) {
      return res.status(404).json({
        error: "Report not found.",
      });
    }

    // Update product quantity before deleting the report
    const product = await prisma.products.findFirst({
      where: {
        productName: report.productName,
      },
    });

    if (product) {
      await prisma.products.update({
        where: { id: product.id },
        data: {
          quantity: product.quantity + report.quantity,
        },
      });
    }

    // Delete the report
    await prisma.reports.delete({
      where: { id: reportIdInt },
    });

    return res.json({
      success: "Product deleted successfully from the invoice.",
    });
  } catch (error) {
    console.error("Error deleting product from invoice:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

async function deleteInvoice(req: Request, res: Response) {
  try {
    const { invoiceNumber } = req.query;

    if (!invoiceNumber) {
      return res.status(400).json({
        error: "Invoice number is required",
      });
    }

    // Ensure invoiceNumber is a number
    const invoiceNumberInt = parseInt(invoiceNumber as string, 10);
    if (isNaN(invoiceNumberInt)) {
      return res.status(400).json({
        error: "Invalid invoice number.",
      });
    }

    // Find all products associated with the invoice (including those added by editInvoice)
    const productsToUpdate = await prisma.reports.findMany({
      where: {
        invoiceNumber: invoiceNumberInt,
      },
      select: {
        productName: true,
        quantity: true,
      },
    });

    if (productsToUpdate.length === 0) {
      return res.status(404).json({
        error: "Invoice not found.",
      });
    }

    // Check if all products are available in the product table
    const unavailableProducts: string[] = [];
    for (const product of productsToUpdate) {
      const productRecord = await prisma.products.findFirst({
        where: {
          productName: product.productName,
        },
      });

      if (!productRecord) {
        unavailableProducts.push(product.productName);
      }
    }

    // If any product is unavailable, do not allow deletion
    if (unavailableProducts.length > 0) {
      return res.status(400).json({
        error: `Cannot delete invoice. The following products are not available: ${unavailableProducts.join(", ")}`,
      });
    }

    // Update product quantities by adding back the quantity from the invoice
    for (const product of productsToUpdate) {
      const productRecord = await prisma.products.findFirst({
        where: {
          productName: product.productName,
        },
      });

      if (productRecord) {
        await prisma.products.update({
          where: { id: productRecord.id },
          data: {
            quantity: productRecord.quantity + product.quantity, // Add back the quantity
          },
        });
      }
    }

    // Delete all reports associated with the invoiceNumber, including newly added products
    await prisma.reports.deleteMany({
      where: {
        invoiceNumber: invoiceNumberInt,
      },
    });

    return res.json({
      success: "Invoice and associated products deleted successfully, and product quantities updated.",
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

async function getInvoiceDetails(req: Request, res: Response) {
  try {
    const invoiceNumber = parseInt(req.query.invoiceNumber as string);

    if (isNaN(invoiceNumber)) {
      return res.status(400).json({
        error: "Invalid invoiceNumber. Please provide a valid invoiceNumber.",
      });
    }

    const commonDetails = await prisma.reports.findMany({
      where: { invoiceNumber: invoiceNumber },
      select: {
        name: true,
        area: true,
        gst: true,
        spl: true,
        date: true,
        paymentMethod: true,
        category: true,
      },
    });

    if (commonDetails.length === 0) {
      return res.status(404).json({
        error: "No details found for the given invoice number.",
      });
    }

    // Assuming you want to return unique values for the common details
    const uniqueDetails = {
      name: commonDetails[0].name,
      area: commonDetails[0].area,
      gst: commonDetails[0].gst,
      spl: commonDetails[0].spl,
      date: commonDetails[0].date,
      paymentMethod: commonDetails[0].paymentMethod,
      category: commonDetails[0].category,
    };

    return res.json({
      success: uniqueDetails,
    });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

async function updateInvoiceDetails(req: Request, res: Response) {
  try {
    const invoiceNumber = parseInt(req.query.invoiceNumber as string);

    if (isNaN(invoiceNumber)) {
      return res.status(400).json({
        error: "Valid invoice number is required.",
      });
    }

    const commonDetails = await prisma.reports.findMany({
      where: { invoiceNumber: invoiceNumber },
      select: {
        name: true,
        area: true,
        gst: true,
        spl: true,
        date: true,
        paymentMethod: true,
        category: true,
      },
    });

    if (commonDetails.length === 0) {
      return res.status(404).json({
        error: "No details found for the given invoice number.",
      });
    }

    // Update the details with the data from the body
    const updatedData = req.body; // All fields in the body will be used for the update
    await prisma.reports.updateMany({
      where: { invoiceNumber: invoiceNumber },
      data: updatedData,
    });

    // Return the updated details
    return res.json({
      success: updatedData, // Return the updated data directly
      message: "Invoice details retrieved and updated successfully.",
    });
  } catch (error) {
    console.error("Error updating invoice details:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}


//#region
//get Reports
async function getReport(req: Request, res: Response) {
  try {
    const maxResult = parseInt(req.query.maxResult as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const currentDate = new Date().toISOString().split("T")[0];
    const formattedDate = currentDate.split("-").reverse().join("-");

    const whereCondition = {
      date: {
        equals: formattedDate,
      },
    };

    const totalReportsCount = await prisma.reports.count({
      where: whereCondition,
    });

    const countByInvoiceNumber = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
      _min: {
        id: true,
      },
    });

    const distinctInvoiceNumbers = countByInvoiceNumber.map(
      (item) => item.invoiceNumber
    );

    const firstProductsByInvoice = await Promise.all(
      distinctInvoiceNumbers.map(async (invoiceNumber) => {
        const firstProduct = await prisma.reports.findFirst({
          where: {
            invoiceNumber: invoiceNumber,
          },
          select: {
            id: true,
            invoiceNumber: true,
            paymentMethod: true,
            gst: true,
            spl: true,
            name: true,
            date: true,
          },
        });
        return {
          invoiceNumber: invoiceNumber,
          _count:
            countByInvoiceNumber.find(
              (item) => item.invoiceNumber === invoiceNumber
            )?._count._all || 0,
          firstProduct: firstProduct,
        };
      })
    );

    const startIndex = (page - 1) * maxResult;
    const endIndex = startIndex + maxResult;
    const paginatedFirstProducts = firstProductsByInvoice.slice(
      startIndex,
      endIndex
    );

    if (paginatedFirstProducts.length === 0) {
      return res.status(404).json({
        error: {
          message: "No reports available for the given criteria.",
        },
      });
    }

    const totalPages = Math.ceil(totalReportsCount / maxResult);

    if (page > totalPages) {
      return res.status(404).json({
        error: {
          message: "Page not found.",
        },
      });
    }

    const countByInvoiceNumbers = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
    });

    return res.json({
      success: paginatedFirstProducts,
      totalReportsCount,
      totalPages,
      currentPage: page,
      countByInvoiceNumbers,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
}

//#region
//getReportsBy
async function getReportsBy(req: Request, res: Response) {
  try {
    const maxResult = parseInt(req.query.maxResult as string) || 10;
    const page = parseInt(req.query.page as string) || 1;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.json({
        error: "startDate and endDate parameters are required.",
      });
    }

    const formattedStartDate = startDate.split("-").join("-");
    const formattedEndDate = endDate.split("-").join("-");

    const whereCondition = {
      date: {
        gte: formattedStartDate,
        lte: formattedEndDate,
      },
    };

    const totalReportsCount = await prisma.reports.count({
      where: whereCondition,
    });

    const countByInvoiceNumber = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
      _min: {
        id: true,
      },
    });

    const distinctInvoiceNumbers = countByInvoiceNumber.map(
      (item) => item.invoiceNumber
    );

    const firstProductsByInvoice = await Promise.all(
      distinctInvoiceNumbers.map(async (invoiceNumber) => {
        const firstProduct = await prisma.reports.findFirst({
          where: {
            invoiceNumber: invoiceNumber,
          },
          select: {
            id: true,
            invoiceNumber: true,
            paymentMethod: true,
            gst: true,
            spl: true,
            name: true,
            date: true,
          },
        });
        return {
          invoiceNumber: invoiceNumber,
          _count:
            countByInvoiceNumber.find(
              (item) => item.invoiceNumber === invoiceNumber
            )?._count._all || 0, // Handle possibly undefined value
          firstProduct: firstProduct,
        };
      })
    );

    const startIndex = (page - 1) * maxResult;
    const endIndex = startIndex + maxResult;
    const paginatedFirstProducts = firstProductsByInvoice.slice(
      startIndex,
      endIndex
    );

    if (paginatedFirstProducts.length === 0) {
      return res.status(404).json({
        error: {
          message: "No reports available for the given criteria.",
        },
      });
    }

    const totalPages = Math.ceil(totalReportsCount / maxResult);

    if (page > totalPages) {
      return res.status(404).json({
        error: {
          message: "Page not found.",
        },
      });
    }

    const countByInvoiceNumbers = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
    });

    return res.json({
      success: paginatedFirstProducts,
      totalReportsCount,
      totalPages,
      currentPage: page,
      countByInvoiceNumbers,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
}
//#endregion

//#region
//getProductsReports
// async function getProductsReports(req: Request, res: Response) {
//   try {
//     const maxResult = parseInt(req.query.maxResult as string) || 10;
//     const page = parseInt(req.query.page as string) || 1;
//     const invoiceNumber = parseInt(req.query.invoiceNumber as string);

//     if (isNaN(invoiceNumber)) {
//       return res.status(400).json({
//         error: "Invalid invoiceNumber. Please provide a valid invoiceNumber.",
//       });
//     }

//     const whereCondition: any = {
//       invoiceNumber: invoiceNumber,
//     };

//     const reports = await prisma.reports.findMany({
//       where: whereCondition,
//       take: maxResult,
//       skip: (page - 1) * maxResult,
//     });

//     const totalReportsCount = await prisma.reports.count({
//       where: whereCondition,
//     });

//     if (reports.length === 0) {
//       return res.status(404).json({
//         error: {
//           message: "No reports available for the given invoice number.",
//         },
//       });
//     }

//     const totalPages = Math.ceil(totalReportsCount / maxResult);

//     if (page > totalPages) {
//       return res.status(404).json({
//         error: {
//           message: "Page not found.",
//         },
//       });
//     }

//     return res.json({
//       success: reports,
//       totalReportsCount,
//       totalPages,
//     });

//   } catch (error) {
//     return res.status(500).json({ error: "Internal server error." });
//   }
// }
//#endregion

async function getProductsReports(req: Request, res: Response) {
  try {
    const invoiceNumber = parseInt(req.query.invoiceNumber as string);

    if (isNaN(invoiceNumber)) {
      return res.status(400).json({
        error: "Invalid invoiceNumber. Please provide a valid invoiceNumber.",
      });
    }

    const whereCondition = {
      invoiceNumber: invoiceNumber,
    };

    const reports = await prisma.reports.findMany({
      where: whereCondition,
    });

    if (reports.length === 0) {
      return res.status(404).json({
        error: {
          message: "No reports available for the given invoice number.",
        },
      });
    }

    return res.json({
      success: reports,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
}

//#region
//getByName
async function getByName(req: Request, res: Response) {
  try {
    const name = req.query.name as string;
    const currentPage = parseInt(req.query.currentPage as string) || 1;
    const maxResult = parseInt(req.query.maxResult as string) || 10;

    if (!name) {
      return res.status(400).json({
        error: "name parameter is required.",
      });
    }

    const skip = (currentPage - 1) * maxResult;

    const totalProducts = await prisma.reports.count({
      where: {
        name: {
          contains: name,
        },
      },
    });

    const countByInvoice = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: {
        name: {
          contains: name,
        },
      },
    });

    const distinctInvoiceNumbers = countByInvoice.map(
      (item) => item.invoiceNumber
    );

    const firstProductsByInvoice = await Promise.all(
      distinctInvoiceNumbers.map(async (invoiceNumber) => {
        const firstProduct = await prisma.reports.findFirst({
          where: {
            invoiceNumber: invoiceNumber,
          },
          select: {
            id: true,
            invoiceNumber: true,
            paymentMethod: true,
            gst: true,
            spl: true,
            name: true,
            date: true,
          },
        });
        return {
          invoiceNumber: invoiceNumber,
          _count:
            countByInvoice.find((item) => item.invoiceNumber === invoiceNumber)
              ?._count._all || 0,
          firstProduct: firstProduct,
        };
      })
    );

    if (totalProducts === 0) {
      return res.status(404).json({
        message: "No products found for the provided name.",
      });
    }

    const totalPages = Math.ceil(totalProducts / maxResult);

    return res.json({
      success: firstProductsByInvoice,
      totalProducts: totalProducts,
      totalPages: totalPages,
      currentPage: currentPage,
      countByInvoice: countByInvoice,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
}
//#endregion

//#region
//getReport for pdf
async function getPdf(req: Request, res: Response) {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.json({
        error: "startDate and endDate parameters are required.",
      });
    }

    const formattedStartDate = startDate.split("-").join("-");
    const formattedEndDate = endDate.split("-").join("-");

    const whereCondition = {
      date: {
        gte: formattedStartDate,
        lte: formattedEndDate,
      },
    };

    const totalReportsCount = await prisma.reports.count({
      where: whereCondition,
    });

    const countByInvoiceNumber = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
      _min: {
        id: true,
      },
    });

    const distinctInvoiceNumbers = countByInvoiceNumber.map(
      (item) => item.invoiceNumber
    );

    const firstProductsByInvoice = await Promise.all(
      distinctInvoiceNumbers.map(async (invoiceNumber) => {
        const firstProduct = await prisma.reports.findFirst({
          where: {
            invoiceNumber: invoiceNumber,
          },
          select: {
            id: true,
            invoiceNumber: true,
            paymentMethod: true,
            gst: true,
            spl: true,
            name: true,
            date: true,
          },
        });
        return {
          invoiceNumber: invoiceNumber,
          _count:
            countByInvoiceNumber.find(
              (item) => item.invoiceNumber === invoiceNumber
            )?._count._all || 0,
          firstProduct: firstProduct,
        };
      })
    );

    const countByInvoiceNumbers = await prisma.reports.groupBy({
      by: ["invoiceNumber"],
      _count: {
        _all: true,
      },
      where: whereCondition,
    });

    if (firstProductsByInvoice.length === 0) {
      return res.status(404).json({
        error: {
          message: "No reports available for the given criteria.",
        },
      });
    }

    return res.json({
      success: firstProductsByInvoice,
      totalReportsCount,
      countByInvoiceNumbers,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error." });
  }
}
//#endregion
