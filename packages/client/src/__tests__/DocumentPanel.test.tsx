import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentPanel } from '../components/DocumentPanel';
import type { Document } from '@agent-chat/shared';

const mockDocuments: Document[] = [
  {
    id: 'doc-1',
    channelId: 'ch-1',
    tenantId: 't-1',
    title: 'Test Document',
    content: 'Document content here',
    contentType: 'text',
    createdById: 'agent-1',
    createdByName: 'Agent One',
    createdByType: 'agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'doc-2',
    channelId: 'ch-1',
    tenantId: 't-1',
    title: 'Markdown Doc',
    content: '# Hello World',
    contentType: 'markdown',
    createdById: 'agent-2',
    createdByName: 'Agent Two',
    createdByType: 'agent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('DocumentPanel', () => {
  test('renders loading state', () => {
    render(<DocumentPanel documents={[]} loading={true} error={null} />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  test('renders error state', () => {
    render(<DocumentPanel documents={[]} loading={false} error="Network error" />);
    expect(screen.getByText('Error: Network error')).toBeInTheDocument();
  });

  test('renders empty state when no documents (DOC-03)', () => {
    render(<DocumentPanel documents={[]} loading={false} error={null} />);
    expect(screen.getByText('No documents in this channel')).toBeInTheDocument();
  });

  test('renders document titles (DOC-03)', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);
    expect(screen.getByText('Test Document')).toBeInTheDocument();
    expect(screen.getByText('Markdown Doc')).toBeInTheDocument();
  });

  test('renders document count', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('renders content type badges', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('markdown')).toBeInTheDocument();
  });

  test('renders author names', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);
    expect(screen.getByText('Agent One')).toBeInTheDocument();
    expect(screen.getByText('Agent Two')).toBeInTheDocument();
  });

  test('clicking document title shows content', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);

    // Content should not be visible initially
    expect(screen.queryByText('Document content here')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('Test Document'));

    // Content should now be visible
    expect(screen.getByText('Document content here')).toBeInTheDocument();
  });

  test('clicking expanded document collapses it', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);

    // Expand
    fireEvent.click(screen.getByText('Test Document'));
    expect(screen.getByText('Document content here')).toBeInTheDocument();

    // Collapse
    fireEvent.click(screen.getByText('Test Document'));
    expect(screen.queryByText('Document content here')).not.toBeInTheDocument();
  });

  test('documents header shows Documents label', () => {
    render(<DocumentPanel documents={mockDocuments} loading={false} error={null} />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });
});
