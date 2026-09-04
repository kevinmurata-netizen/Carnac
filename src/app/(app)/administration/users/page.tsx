import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listUsers, listRoles } from "@/server/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { updateUserRoleAction, toggleUserActiveAction } from "../actions";
import { getPageName } from "@/server/navigation";
import { AddUserForm, ResetPasswordForm } from "./user-forms";

export default async function UsersPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration/users", "Users");
  const { canWrite: canEdit } = await requireCard("/administration/users");

  const [users, roles] = await Promise.all([listUsers(organizationId), listRoles()]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Add people, assign a role, reset passwords and deactivate accounts"
      />

      {!canEdit && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Only an Administrator can change roles or deactivate
            accounts.
          </CardContent>
        </Card>
      )}

      {canEdit && <AddUserForm roles={roles} />}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Inspections</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === session!.user.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.roleCode === "ADMINISTRATOR" ? "default" : "secondary"}>{u.roleName}</Badge>
                    </TableCell>
                    <TableCell>{formatNumber(u.inspectionCount)}</TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        {isSelf ? (
                          <div className="space-y-2">
                            <span className="text-xs text-muted-foreground">
                              Cannot change your own role or status
                            </span>
                            <ResetPasswordForm userId={u.id} email={u.email} />
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-start gap-2">
                            <form action={updateUserRoleAction} className="flex items-center gap-1">
                              <input type="hidden" name="userId" value={u.id} />
                              <select
                                name="roleId"
                                defaultValue={u.roleId}
                                className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                              >
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                              <Button type="submit" size="xs" variant="outline">
                                Set Role
                              </Button>
                            </form>
                            <form action={toggleUserActiveAction}>
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="isActive" value={String(!u.isActive)} />
                              <Button type="submit" size="xs" variant={u.isActive ? "destructive" : "outline"}>
                                {u.isActive ? "Deactivate" : "Activate"}
                              </Button>
                            </form>
                            <ResetPasswordForm userId={u.id} email={u.email} />
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        A person&apos;s role is what decides which pages and cards they can reach. Setting that up now lives on its own
        screen —{" "}
        <Link href="/administration/roles" className="text-primary hover:underline">
          Roles &amp; Permissions
        </Link>
        .
      </p>
    </div>
  );
}
