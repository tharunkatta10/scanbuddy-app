import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import { TextractClient, AnalyzeDocumentCommand } from '@aws-sdk/client-textract';
import { OpenAI } from 'openai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const textractClient = new TextractClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// OCR endpoint
app.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded");
    }

    const fileBytes = fs.readFileSync(req.file.path);
    const params = {
      Document: { Bytes: fileBytes },
      FeatureTypes: ['FORMS', 'TABLES']
    };

    const command = new AnalyzeDocumentCommand(params);
    const response = await textractClient.send(command);

    const blocks = response.Blocks || [];
    const lines = blocks
      .filter(b => b.BlockType === 'LINE')
      .map(b => b.Text)
      .join('\n');

    res.json({ text: lines });
  } catch (err) {
    console.error('Textract Error:', err);
    res.status(500).send('Textract failed');
  }
});

// Summary endpoint
app.post('/summarize', async (req, res) => {
  try {
    const { text } = req.body;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: "system",
          content: "You're an OCR summary assistant. Clean and summarize the extracted text."
        },
        {
          role: "user",
          content: `Summarize this OCR result:\n\n${text}`
        }
      ],
      temperature: 0.5,
      max_tokens: 200
    });

    const summary = completion.choices[0].message.content;
    res.json({ summary });
  } catch (err) {
    console.error('OpenAI Error:', err);
    res.status(500).send('Summarization failed');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});

