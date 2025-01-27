require('dotenv').config(); // Importa dotenv para cargar el archivo .env

const fetch = require('node-fetch');

// Configuración
const SHOPIFY_STORE = "https://dfzypg-gw.myshopify.com";
const API_VERSION = "2023-10";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // Obtén el token desde el archivo .env

// Función para pausar
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Función para obtener todos los productos con paginación
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
          "X-Shopify-Access-Token": ACCESS_TOKEN, // Usa el token del entorno
        },
      });

      if (!response.ok) {
        throw new Error(`Error en la solicitud: ${response.statusText}`);
      }

      const data = await response.json();
      products = products.concat(data.products);

      // Buscar el enlace para la próxima página en el header `Link`
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

// Función para obtener Metafields de un producto con manejo de rate limit
async function getProductMetafields(productId) {
  const endpoint = `${SHOPIFY_STORE}/admin/api/${API_VERSION}/products/${productId}/metafields.json`;

  while (true) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": ACCESS_TOKEN, // Usa el token del entorno
      },
    });

    if (response.ok) {
      return await response.json();
    } else if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "1", 10);
      console.warn(`Límite alcanzado. Esperando ${retryAfter} segundos...`);
      await sleep(retryAfter * 1000);
    } else {
      throw new Error(`Error obteniendo Metafields: ${response.statusText}`);
    }
  }
}

// Función principal para obtener productos y Metafields
async function obtenerDatosDescargas() {
  const products = await getAllProducts();

  if (products.length === 0) {
    return [];
  }

  const results = [];

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

      // Añadir título y descargas al resultado
      results.push({
        title: product.title,
        downloads: downloadCount,
      });
    } catch (error) {
      console.error(`Error con el producto "${product.title}":`, error.message);
    }
  }

  return results;
}

// Exportar la función para usarla en el servidor
module.exports = obtenerDatosDescargas;