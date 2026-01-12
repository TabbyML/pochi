import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import type { Meta, StoryObj } from "@storybook/react";
import { ErrorMessageView } from "../error-message-view";

class TaskError extends Error {
  constructor(
    readonly name: string,
    message: string,
  ) {
    super(message);
  }
}

const meta: Meta<typeof ErrorMessageView> = {
  component: ErrorMessageView,
  title: "Chat/ErrorMessageView",
  argTypes: {
    error: {
      control: {
        type: "object",
      },
      description: "The error object to display.",
    },
  },
  parameters: {
    layout: "centered",
  },
};

export default meta;

type Story = StoryObj<typeof ErrorMessageView>;

export const Default: Story = {
  args: {
    error: new TaskError("GenericError", "An unexpected error occurred."),
  },
};

export const ReachedCreditLimit: Story = {
  args: {
    error: new TaskError("CreditLimitError", PochiApiErrors.ReachedCreditLimit),
  },
};

export const ReachedOrgCreditLimit: Story = {
  args: {
    error: new TaskError(
      "OrgCreditLimitError",
      PochiApiErrors.ReachedOrgCreditLimit,
    ),
  },
};

export const RequireSubscription: Story = {
  args: {
    error: new TaskError(
      "SubscriptionRequired",
      PochiApiErrors.RequireSubscription,
    ),
  },
};

export const RequireOrgSubscription: Story = {
  args: {
    error: new TaskError(
      "OrgSubscriptionRequired",
      PochiApiErrors.RequireOrgSubscription,
    ),
  },
};

export const RequirePayment: Story = {
  args: {
    error: new TaskError("PaymentRequired", PochiApiErrors.RequirePayment),
  },
};

export const RequireOrgPayment: Story = {
  args: {
    error: new TaskError(
      "OrgPaymentRequired",
      PochiApiErrors.RequireOrgPayment,
    ),
  },
};

export const RequireSubscriptionForSuperModels: Story = {
  args: {
    error: new TaskError(
      "RequireSubscriptionForSuperModels",
      PochiApiErrors.RequireSubscriptionForSuperModels,
    ),
  },
};
