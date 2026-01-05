import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { fileURLToPath } from "url";

const app = express();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: "*", 
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Remove the duplicate __dirname declaration on line 18

const getUploadsDir = () => {
  if (process.env.NODE_ENV === "production") {
    const tmpDir = path.join("/tmp", "gayatri-uploads");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
  const localDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  return localDir;
};

const getMockDir = () => {
  if (process.env.NODE_ENV === "production") {
    const tmpDir = path.join("/tmp", "gayatri-mock");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
  const localDir = path.join(__dirname, "mock");
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  return localDir;
};

const uploadsDir = getUploadsDir();
const mockDir = getMockDir();

console.log(" Gayatri Backend starting...");
console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
console.log(` Uploads: ${uploadsDir}`);
console.log(` Mock data: ${mockDir}`);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const getCategoryPath = (category) => {
  return path.join(mockDir, `${category.toLowerCase()}.json`);
};

app.get("/", (req, res) => {
  res.json({
    message: "Gayatri Shop API",
    version: "1.0.0",
    status: "running",
    environment: process.env.NODE_ENV || "development",
    endpoints: {
      products: "/:category (face, body, hair, decor, oils)",
      uploads: "/uploads/:filename",
      health: "/health"
    }
  });
});

app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get("/:category", (req, res) => {
  try {
    const category = req.params.category.toLowerCase();
    const filePath = getCategoryPath(category);
    
    console.log(` GET /${category}`);
    
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
      return res.json([]);
    }
    
    const data = fs.readFileSync(filePath, "utf8");
    const products = JSON.parse(data);
    
    const productsWithFullUrl = products.map(product => ({
      ...product,
      image: product.image ? `${req.protocol}://${req.get("host")}${product.image}` : null
    }));
    
    res.json(productsWithFullUrl);
    
  } catch (error) {
    console.error(" Error:", error);
    res.status(500).json({ error: "Failed to load products" });
  }
});

app.post("/:category", upload.single("image"), (req, res) => {
  try {
    const category = req.params.category.toLowerCase();
    const { name, price, mililitres } = req.body;
    
    console.log(` POST /${category}`, { name, price, mililitres });
    
    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required" });
    }
    
    let imageUrl = "";
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
      console.log(` Image saved: ${imageUrl}`);
    }
    
    const newProduct = {
      id: uuidv4(),
      name: String(name),
      price: Number(price),
      mililitres: mililitres ? Number(mililitres) : 0,
      category: category,
      image: imageUrl,
      createdAt: new Date().toISOString()
    };
    
    console.log(` New product:`, newProduct);
    
    const filePath = getCategoryPath(category);
    let products = [];
    
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      products = JSON.parse(data);
    }
    
    products.push(newProduct);
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
    
    const responseProduct = {
      ...newProduct,
      image: imageUrl ? `${req.protocol}://${req.get("host")}${imageUrl}` : null
    };
    
    res.status(201).json(responseProduct);
    
  } catch (error) {
    console.error(" Error:", error);
    res.status(500).json({ error: "Failed to add product" });
  }
});

app.delete("/:category/:id", (req, res) => {
  try {
    const category = req.params.category.toLowerCase();
    const id = req.params.id;
    
    console.log(` DELETE /${category}/${id}`);
    
    const filePath = getCategoryPath(category);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    const data = fs.readFileSync(filePath, "utf8");
    let products = JSON.parse(data);
    
    const productIndex = products.findIndex(p => p.id === id);
    
    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const deletedProduct = products[productIndex];
    
    if (deletedProduct.image) {
      const imageName = deletedProduct.image.split("/").pop();
      const imagePath = path.join(uploadsDir, imageName);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(` Deleted image: ${imagePath}`);
      }
    }
    
    products.splice(productIndex, 1);
    fs.writeFileSync(filePath, JSON.stringify(products, null, 2));
    
    console.log(` Product ${id} deleted from ${category}`);
    res.json({ 
      message: "Product deleted successfully",
      deletedProduct 
    });
    
  } catch (error) {
    console.error(" Error:", error);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

app.use("/uploads", express.static(uploadsDir));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(" Server error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: err.message 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("==========================================");
});