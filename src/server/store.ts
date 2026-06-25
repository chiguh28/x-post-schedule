import { ScheduledPost, PostImage } from '../types';
import { v4 as uuidv4 } from 'uuid';

class PostStore {
  private posts: Map<string, ScheduledPost> = new Map();

  getAll(): ScheduledPost[] {
    return Array.from(this.posts.values()).sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
    );
  }

  get(id: string): ScheduledPost | undefined {
    return this.posts.get(id);
  }

  addMany(posts: ScheduledPost[]): void {
    for (const post of posts) {
      this.posts.set(post.id, post);
    }
  }

  update(id: string, data: Partial<Pick<ScheduledPost, 'text' | 'scheduledAt' | 'status' | 'error'>>): ScheduledPost | undefined {
    const post = this.posts.get(id);
    if (!post) return undefined;
    if (data.text !== undefined) post.text = data.text;
    if (data.scheduledAt !== undefined) post.scheduledAt = data.scheduledAt;
    if (data.status !== undefined) post.status = data.status;
    if (data.error !== undefined) post.error = data.error;
    return post;
  }

  delete(id: string): boolean {
    return this.posts.delete(id);
  }

  addImage(postId: string, image: PostImage): ScheduledPost | undefined {
    const post = this.posts.get(postId);
    if (!post || post.images.length >= 4) return undefined;
    post.images.push(image);
    return post;
  }

  removeImage(postId: string, imageIndex: number): ScheduledPost | undefined {
    const post = this.posts.get(postId);
    if (!post || imageIndex < 0 || imageIndex >= post.images.length) return undefined;
    post.images.splice(imageIndex, 1);
    return post;
  }

  reorderImages(postId: string, newOrder: number[]): ScheduledPost | undefined {
    const post = this.posts.get(postId);
    if (!post) return undefined;
    const reordered = newOrder.map(i => post.images[i]).filter(Boolean);
    post.images = reordered;
    return post;
  }

  clear(): void {
    this.posts.clear();
  }
}

export const store = new PostStore();
