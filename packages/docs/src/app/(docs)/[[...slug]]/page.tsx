import { formatTitle } from "@/app/layout.config";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import defaultMdxComponents, { createRelativeLink } from "fumadocs-ui/mdx";
import { DocsBody, DocsPage, DocsTitle } from "fumadocs-ui/page";
import { notFound } from "next/navigation";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDXContent = page.data.body;

  // Only show h1 and h2 in TOC for developer updates page to avoid having too many items
  const isDeveloperUpdatesPage = page.slugs.includes('developer-updates') && page.slugs.length === 1;
  const filteredToc = isDeveloperUpdatesPage
    ? page.data.toc.filter(x => x.depth === 3)
    : page.data.toc;
  
  // Construct the file path for GitHub edit
  const filePath = page.slugs.join('/');

  return (
    <DocsPage
      toc={filteredToc}
      full={page.data.full}
      editOnGithub={
        {
          owner: 'TabbyML',
          repo: 'pochi',
          sha: 'main',
          path: `/packages/docs/content/docs/${filePath ? `${filePath}` : 'index'}.mdx`,
        }
      }
    >
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
            h1: (props) => {
              if (isDeveloperUpdatesPage) {
                return
              }

              return defaultMdxComponents["h1"](props);
            },
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: formatTitle(page.data.title),
    description: page.data.description,
  };
}
