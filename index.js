require('dotenv').config(); // Importa dotenv para cargar el archivo .env

const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = 3000;

// Configuración de Shopify
const SHOPIFY_STORE = "https://dfzypg-gw.myshopify.com";
const API_VERSION = "2023-10";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // Obtén el token desde el archivo .env

// Middleware para permitir que Shopify cargue en iframe
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "frame-ancestors https://admin.shopify.com https://*.myshopify.com");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Ruta principal: Página con las estadísticas
app.get("/estadisticas", async (req, res) => {
  try {
    // Obtener los productos y sus descargas
    const products = await getAllProducts();
    const productData = [];

    for (const product of products) {
      try {
        const metafieldsData = await getProductMetafields(product.id);

        const downloadCountMetafield = metafieldsData.metafields.find(
          (metafield) =>
            metafield.namespace === "custom" && metafield.key === "download_count"
        );

        const downloadCount = downloadCountMetafield
          ? downloadCountMetafield.value
          : "Sin datos";

        productData.push({ title: product.title, downloads: downloadCount });
      } catch (error) {
        console.error(`Error obteniendo los Metafields del producto ${product.id}:`, error.message);
      }
    }

    // Renderizar los datos en formato HTML (tabla)
    const tableRows = productData
      .map(
        (product) =>
          `<tr>
             <td>${product.title}</td>
             <td>${product.downloads}</td>
           </tr>`
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Estadísticas de Descargas</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f4f4f4;
          }
        </style>
      </head>
      <body>
        <h1>Estadísticas de Descargas</h1>
        <table>
          <thead>
            <tr>
              <th>Libro</th>
              <th>Descargas</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error("Error generando estadísticas:", error.message);
    res.status(500).send("Error generando estadísticas.");
  }
});

// Función para obtener productos con paginación
async function getAllProducts() {
  let products = [];
  let endpoint = `${SHOPIFY_STORE}/admin/api/${API_VERSION}/products.json?limit=50`;
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": ACCESS_TOKEN,
        },
      });

      if (!response.ok) {
        throw new Error(`Error en la solicitud: ${response.statusText}`);
      }

      const data = await response.json();
      products = products.concat(data.products);

      const linkHeader = response.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextLink = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        endpoint = nextLink ? nextLink[1] : null;
      } else {
        hasNextPage = false;
      }
    } catch (error) {
      console.error("Error obteniendo productos:", error.message);
      break;
    }
  }

  return products;
}

// Función para obtener Metafields de un producto
async function getProductMetafields(productId) {
  const endpoint = `${SHOPIFY_STORE}/admin/api/${API_VERSION}/products/${productId}/metafields.json`;

  while (true) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN,
      },
    });

    if (response.ok) {
      return await response.json();
    } else if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10);
      console.warn(`Límite alcanzado. Esperando ${retryAfter} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    } else {
      throw new Error(`Error obteniendo Metafields del producto ${productId}: ${response.statusText}`);
    }
  }
}

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});