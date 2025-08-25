/** GraphQL mutations for the Interlynk API. */

export const SBOM_UPLOAD = /* GraphQL */ `
  mutation uploadSbom(
    $doc: Upload!
    $projectId: ID
    $projectName: String
    $projectGroupName: String
    $projectGroupId: ID
  ) {
    sbomUpload(
      input: {
        doc: $doc
        projectId: $projectId
        projectName: $projectName
        projectGroupName: $projectGroupName
        projectGroupId: $projectGroupId
      }
    ) {
      errors
    }
  }
`;

