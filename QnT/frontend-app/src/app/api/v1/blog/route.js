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

async function writeBlogs(blogs) {
  await ensureBlogFile();
  await fs.writeFile(BLOG_FILE, JSON.stringify(blogs, null, 2), 'utf8');
}

export async function GET() {
  const blogs = await readBlogs();
  const sorted = blogs.sort((a, b) => new Date(b.createdat) - new Date(a.createdat));
  return NextResponse.json({ data: sorted });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const title = body?.title?.trim();
    const content = body?.content?.trim();

    if (!title || !content) {
      return NextResponse.json({ message: 'title và content là bắt buộc' }, { status: 400 });
    }

    const blogs = await readBlogs();
    const now = new Date().toISOString();
    const nextId = blogs.length ? Math.max(...blogs.map(b => Number(b.id) || 0)) + 1 : 1;

    const newBlog = {
      id: nextId,
      title,
      description: body?.description?.trim() || '',
      content,
      imageurl: body?.imageurl?.trim() || '/assets/img/blog/01.jpg',
      createdat: now,
      updatedat: now,
      createdBy: body?.createdBy || 'admin'
    };

    blogs.push(newBlog);
    await writeBlogs(blogs);

    return NextResponse.json({ message: 'Tạo blog thành công', data: newBlog }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: 'Không thể tạo blog', error: error?.message }, { status: 500 });
  }
}
