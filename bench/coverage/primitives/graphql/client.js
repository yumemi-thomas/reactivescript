import { createGraphQLClient, gql } from "@solid-primitives/graphql";
export const createGreeting = url => createGraphQLClient(url)(gql`query { hello }`);
