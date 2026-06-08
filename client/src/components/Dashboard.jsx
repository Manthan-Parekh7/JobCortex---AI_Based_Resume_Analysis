import React from "react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";

const Dashboard = () => {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-64 bg-muted/40 p-6 flex flex-col justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-8">Dashboard</h2>
          <nav className="flex flex-col space-y-4">
            <Link to="/jobs">
              <Button variant="ghost" className="w-full justify-start">Find Jobs</Button>
            </Link>
            <Link to="/applications">
              <Button variant="ghost" className="w-full justify-start">My Applications</Button>
            </Link>
            <Link to="/profile/edit">
              <Button variant="ghost" className="w-full justify-start">Edit Profile</Button>
            </Link>
            <Link to="/resume-analysis">
              <Button variant="ghost" className="w-full justify-start">Resume Analysis</Button>
            </Link>
          </nav>
        </div>
        <Button variant="destructive">Logout</Button>
      </aside>
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold">Welcome to your Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Select an option from the sidebar to get started.
        </p>
      </main>
    </div>
  );
};

export default Dashboard;
