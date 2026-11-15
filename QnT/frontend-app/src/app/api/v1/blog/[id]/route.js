import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');
const BLOG_FILE = path.join(DATA_DIR, 'blogs.json');

async function ensureBlogFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(BLOG_FILE);
  } catch {
    await fs.writeFile(BLOG_FILE, '[]', 'utf8');
  }
}

async function readBlogs() {
  await ensureBlogFile();
  const raw = await fs.readFile(BLOG_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(_request, context) {
  const blogs = await readBlogs();
  const params = await context.params;
  const id = Number(params?.id);
  const blog = blogs.find((b) => Number(b.id) === id);

  if (!blog) {
    return NextResponse.json({ message: 'Không tìm thấy blog' }, { status: 404 });
  }

  return NextResponse.json({ data: blog });
}
