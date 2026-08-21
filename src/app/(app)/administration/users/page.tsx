import { auth } from "@/lib/auth";
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
  const pageTitle = await getPageName(organizationId, "/administration/users", "Users & Roles");
  const isAdmin = session!.user.roleName === "Administrator";

  const [users, roles] = await Promise.all([listUsers(organizationId), listRoles()]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Role-based access control — Executive is read-only; Administrator, Asset Manager and Inspector can record field data"
      />

      {!isAdmin && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Only an Administrator can change roles or deactivate
            accounts.
          </CardContent>
        </Card>
      )}

      {isAdmin && <AddUserForm roles={roles} />}

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
                {isAdmin && <TableHead>Actions</TableHead>}
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
                      <Badge variant={u.roleName === "Administrator" ? "default" : "secondary"}>{u.roleName}</Badge>
                    </TableCell>
                    <TableCell>{formatNumber(u.inspectionCount)}</TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    {isAdmin && (
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

      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Permissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{formatNumber(r.userCount)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.permissions.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px]">
                          {p === "*" ? "all permissions" : p}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Permissions are stored as data on the Role record, so a new role can be added without a code change.
            The application currently gates on role name for write access; per-permission checks are the natural
            next increment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
