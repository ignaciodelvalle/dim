// `MyTransfersV1`, built from what `listTransfersForUser` already decided.
//
// THIS FILE DECIDES NOTHING. Every fact on the wire — which section a row is in,
// whether it is expired, which of the three answers this caller may give — was
// settled by the use-case, against the SAME domain function
// (`validateRecipientMatch`) the accept and reject writers run. What is left
// here is serialisation: `Date` to ISO, a flat row to the contract's nesting.
//
// That is deliberate and it is the difference between this endpoint and the web
// hub page it mirrors. The hub had the predicate inline; if this file recomputed
// even one of the three capabilities from `status`, this surface would become a
// THIRD copy of a rule that has already drifted once. A reader auditing "who may
// accept a transfer" should find exactly one answer, in
// `list-transfers-for-user.ts`, calling exactly one function.
//
// NO SENDER E-MAIL CROSSES THIS BOUNDARY, and there is nothing to filter: the
// use-case never reads one. `profiles` has no email column, so the only source
// is the Supabase admin API, which no read in this path touches. The `toEmail`
// that does cross is the addressee's, which is either the caller's own address
// or the one they typed — see `@dim/contract/api`'s `my-transfers.ts` header.

import type {
  TransferListItem,
  TransfersForUser,
} from "@/src/modules/transfers/application/list-transfers-for-user";
import {
  MY_TRANSFERS_PAYLOAD_VERSION,
  type MyTransferV1,
  type MyTransfersV1,
} from "@dim/contract/api";

function toTransferV1(item: TransferListItem): MyTransferV1 {
  return {
    transferToken: item.transferToken,
    status: item.status,
    direction: item.direction,
    pet: {
      publicToken: item.petToken,
      name: item.petName,
      species: item.petSpecies,
    },
    counterpartyName: item.counterpartyName,
    toEmail: item.toEmail,
    reason: item.reason,
    note: item.note,
    rejectionReason: item.rejectionReason,
    initiatedAt: item.initiatedAt.toISOString(),
    respondedAt: item.respondedAt === null ? null : item.respondedAt.toISOString(),
    expiresAt: item.expiresAt.toISOString(),
    expired: item.expired,
    capabilities: {
      canAccept: item.canAccept,
      canReject: item.canReject,
      canCancel: item.canCancel,
    },
  };
}

export function buildMyTransfersV1(input: {
  transfers: TransfersForUser;
  now: Date;
}): MyTransfersV1 {
  return {
    payloadVersion: MY_TRANSFERS_PAYLOAD_VERSION,
    generatedAt: input.now.toISOString(),
    incoming: {
      pending: input.transfers.incoming.pending.map(toTransferV1),
      history: input.transfers.incoming.history.map(toTransferV1),
    },
    outgoing: input.transfers.outgoing.map(toTransferV1),
  };
}
