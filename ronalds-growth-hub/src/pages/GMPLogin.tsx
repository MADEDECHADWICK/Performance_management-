import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Crown, Lock, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function GMPLogin() {
  const [email, setEmail] = useState('gmp@ronalds.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:4000/gmp-auth/gmp-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store the token
        localStorage.setItem('gmp_token', data.token);
        localStorage.setItem('gmp_user', JSON.stringify(data.user));
        
        toast({
          title: "Login Successful",
          description: `Welcome back, ${data.user.name}! Redirecting to GMP Dashboard...`,
        });

        // Redirect to GMP Dashboard
        setTimeout(() => {
          navigate('/gmp-dashboard');
        }, 1000);
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Connection error. Please ensure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-full flex items-center justify-center">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Group Managing Partner
            </CardTitle>
            <p className="text-gray-600 mt-2">Secure Executive Access Portal</p>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gmp@ronalds.com"
                  required
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center">
                  <Lock className="h-4 w-4 mr-2" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your secure password"
                  required
                  className="bg-gray-50"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Authenticating...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-2" />
                    Access GMP Dashboard
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
              <h4 className="font-semibold text-amber-800 mb-2">Test Credentials</h4>
              <div className="text-sm text-amber-700 space-y-1">
                <p><strong>Email:</strong> gmp@ronalds.com</p>
                <p><strong>Password:</strong> GMP@Ronalds2026!</p>
                <p className="text-xs mt-2 text-amber-600">
                  Use these credentials to access the GMP dashboard with full privileges.
                </p>
              </div>
            </div>

            <div className="mt-4 text-center">
              <Button 
                variant="link" 
                onClick={() => navigate('/auth')}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to General Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}