// server.js - для Render (CommonJS)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const multer = require("multer");

const app = express();

// CORS для Vercel та локальної розробки
const allowedOrigins = [
  'https://gayatri-app.vercel.app', // ваш Vercel домен
  'http://localhost:3000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Дозволяємо всім для початку
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('CORS not allowed'), false);
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Налаштування для Render (використовуємо /tmp для продакшену)
const __dirname = path.resolve();
const uploadsDir = process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'uploads')  // На Render використовуємо /tmp
  : path.join(__dirname, 'uploads');
  
const mockDir = process.env.NODE_ENV === 'production'
  ? path.join('/tmp', 'mock')     // На Render використовуємо /tmp
  : path.join(__dirname, 'mock');

console.log(`📂 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`📂 Uploads directory: ${uploadsDir}`);
console.log(`📂 Mock directory: ${mockDir}`);

// Перевіряємо чи існують папки
if (!fs.existsSync(uploadsDir)) {
  console.log(`📁 Creating uploads directory: ${uploadsDir}`);
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(mockDir)) {
  console.log(`📁 Creating mock directory: ${mockDir}`);
  fs.mkdirSync(mockDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`📁 Destination: ${uploadsDir}`);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    console.log(`📄 File will be saved as: ${uniqueName}`);
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const getCategoryPath = (category) => {
  const filePath = path.join(mockDir, `${category.toLowerCase()}.json`);
  console.log(`📄 Category file path: ${filePath}`);
  return filePath;
};

// Головний маршрут
app.get("/", (req, res) => {
  res.json({ 
    message: "Gayatri API is running",
    environment: process.env.NODE_ENV || 'development',
    endpoints: ['/face', '/body', '/hair', '/decor', '/oils']
  });
});

app.get("/:category", (req, res) => {
  try {
    const { category } = req.params;
    console.log(`📥 GET /${category}`);
    
    const filePath = getCategoryPath(category);
    
    if (!fs.existsSync(filePath)) {
      console.log(`📄 File does not exist, creating empty array for ${category}`);
      fs.writeFileSync(filePath, "[]", "utf-8");
      return res.json([]);
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    console.log(`📊 Found ${data.length} products in ${category}`);
    res.json(data);
  } catch (error) {
    console.error("❌ Error reading file:", error);
    res.status(500).json({ error: "Failed to read data" });
  }
});

app.post("/:category", upload.single('image'), (req, res) => {
  try {
    const { category } = req.params;
    
    if (!req.body.name || !req.body.price) {
      console.error("❌ Missing required fields");
      return res.status(400).json({ 
        error: "Name and price are required",
        received: req.body
      });
    }

    if (!req.file) {
      console.warn("⚠️ No file uploaded");
    } else {
      console.log(`✅ File uploaded: ${req.file.filename}`);
      console.log(`📁 File saved to: ${req.file.path}`);
      console.log(`📏 File size: ${req.file.size} bytes`);
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
    console.log(`🖼️ Image URL: ${imageUrl}`);

    const product = {
      id: uuid(),
      name: String(req.body.name),
      price: Number(req.body.price),
      mililitres: req.body.mililitres ? Number(req.body.mililitres) : 0,
      category: category.toLowerCase(),
      image: imageUrl,
    };

    console.log(`🆕 Product object:`, product);

    const filePath = getCategoryPath(category);
    
    let data = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      try {
        data = JSON.parse(fileContent);
      } catch (parseError) {
        console.error(`❌ Error parsing JSON from ${filePath}:`, parseError);
        data = [];
      }
    }

    data.push(product);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`✅ Product saved to ${filePath}`);
    
    res.status(201).json(product);
    
  } catch (error) {
    console.error("❌ Error in POST:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message
    });
  }
});

app.delete("/:category/:id", (req, res) => {
  try {
    const { category, id } = req.params;
    console.log(`🗑️ DELETE /${category}/${id}`);
    
    const filePath = getCategoryPath(category);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Category not found" });
    }

    let data = [];
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(fileContent);
    } catch (error) {
      console.error("Error reading file:", error);
      return res.status(500).json({ error: "Failed to read data" });
    }

    const productIndex = data.findIndex(product => product.id === id);
    
    if (productIndex === -1) {
      return res.status(404).json({ error: "Product not found" });
    }

    const deletedProduct = data.splice(productIndex, 1)[0];

    // Видалити файл зображення
    if (deletedProduct.image) {
      const imageName = deletedProduct.image.replace('/uploads/', '');
      const imagePath = path.join(uploadsDir, imageName);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log(`🗑️ Deleted image: ${imagePath}`);
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log(`✅ Product ${id} deleted from ${category} successfully`);
    res.json(deletedProduct);
    
  } catch (error) {
    console.error("Error in DELETE:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error.message 
    });
  }
});

// Статичні файли (зображення)
app.use('/uploads', express.static(uploadsDir));

// Health check для Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads dir: ${uploadsDir}`);
  console.log(`📁 Mock dir: ${mockDir}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});