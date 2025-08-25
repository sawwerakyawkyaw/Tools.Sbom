/** GraphQL queries for the Interlynk API. */

export const PRODUCTS_TOTAL_COUNT = /* GraphQL */ `
  query GetProductsCount($name: String, $enabled: Boolean) {
    organization {
      productNodes: projectGroups(
        search: $name
        enabled: $enabled
        orderBy: { field: PROJECT_GROUPS_UPDATED_AT, direction: DESC }
      ) {
        prodCount: totalCount
      }
    }
  }
`;

export const PRODUCTS_LIST = /* GraphQL */ `
  query GetProducts($first: Int) {
    organization {
      productNodes: projectGroups(
        enabled: true
        first: $first
        orderBy: { field: PROJECT_GROUPS_UPDATED_AT, direction: DESC }
      ) {
        prodCount: totalCount
        products: nodes {
          id
          name
          updatedAt
          enabled
          environments: projects {
            id: id
            name: name
            versions: sboms {
              id
              vulnRunStatus
              updatedAt
              primaryComponent {
                name
                version
              }
            }
          }
        }
      }
    }
  }
`;

export const SBOM_DOWNLOAD = /* GraphQL */ `
  query downloadSbom(
    $projectId: Uuid!
    $sbomId: Uuid!
    $includeVulns: Boolean
    $spec: String
    $original: Boolean
    $package: Boolean
    $lite: Boolean
    $excludeParts: Boolean
    $supportLevelOnly: Boolean
    $includeSupportStatus: Boolean
  ) {
    sbom(projectId: $projectId, sbomId: $sbomId) {
      download(
        sbomId: $sbomId
        includeVulns: $includeVulns
        spec: $spec
        original: $original
        dontPackageSbom: $package
        lite: $lite
        excludeParts: $excludeParts
        supportLevelOnly: $supportLevelOnly
        includeSupportStatus: $includeSupportStatus
      ) {
        content
        contentType
        filename
      }
    }
  }
`;

export const SBOM_DOWNLOAD_NEW = /* GraphQL */ `
  query downloadSbom(
    $projectId: Uuid
    $sbomId: Uuid
    $projectName: String
    $projectGroupName: String
    $versionName: String
    $includeVulns: Boolean
    $spec: SbomSpec
    $original: Boolean
    $package: Boolean
    $lite: Boolean
    $excludeParts: Boolean
    $supportLevelOnly: Boolean
    $includeSupportStatus: Boolean
  ) {
    sbom(
      projectId: $projectId
      sbomId: $sbomId
      projectName: $projectName
      projectGroupName: $projectGroupName
      versionName: $versionName
    ) {
      download(
        sbomId: $sbomId
        includeVulns: $includeVulns
        spec: $spec
        original: $original
        dontPackageSbom: $package
        lite: $lite
        excludeParts: $excludeParts
        supportLevelOnly: $supportLevelOnly
        includeSupportStatus: $includeSupportStatus
      ) {
        content
        contentType
        filename
        __typename
      }
      __typename
    }
  }
`;

export const PRODUCT_BY_ID = /* GraphQL */ `
  query GetProductById($id: ID!) {
    organization {
      productNodes: projectGroups(ids: [$id], enabled: true, first: 1) {
        products: nodes {
          id
          name
          environments: projects {
            id
            name
          }
        }
      }
    }
  }
`;
